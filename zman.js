require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

function cleanForTTS(str) {
    if (!str) return '';
    
    // ניקוי סימני מילוט פנימיים של גרשיים שעלולים להגיע מהשרת
    let cleaned = str.replace(/\\+/g, '').replace(/"/g, '');
    
    // הפיכת ראשי תיבות למילים מלאות עבור מנוע הדיבור
    cleaned = cleaned.replace(/ב?בימ["׳״]?ד/g, (match) => match.startsWith('ב') ? 'בבית המדרש' : 'בית המדרש');
    cleaned = cleaned.replace(/עז["׳״]?נ/g, 'עזרת נשים');
    cleaned = cleaned.replace(/ק\s*ד['״׳]?/g, 'קומה ד');
    
    // ניקוי תווים מיוחדים שיכולים לשבש את המקראה של ימות המשיח
    return cleaned.replace(/[.\-"&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const timeLog = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

    console.log(`\n\n========== [${timeLog}] פנייה חדשה לשרת הלוחות ==========`);
    
    let history = [];
    if (Array.isArray(req.query.menu_choice)) {
        history = req.query.menu_choice;
    } else if (req.query.menu_choice) {
        history = [req.query.menu_choice];
    }

    try {
        // 1. חישוב הזמן הנוכחי בישראל לצורך בניית ה-URL והשוואת זמנים
        const now = new Date();
        const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
        
        const lyear = israelTime.getFullYear();
        const lmonth = israelTime.getMonth() + 1; // חודשים ב-JS מתחילים מ-0
        const lday = israelTime.getDate();
        const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

        // בניית הכתובת הדינמית עם התאריך של היום בשעון ישראל
        const TARGET_URL = `https://zmanimboard.com/GetAllClientData.aspx/?CL_ID=1287&Lyear=${lyear}&Lmonth=${lmonth}&Lday=${lday}&UserPass=Bc3456`;
        
        console.log(`[LOG] פונה לכתובת: ${TARGET_URL}`);

        const response = await axios.get(TARGET_URL);
        
        // הגנה במקרה שהתגובה הגיעה כטקסט ולא כאובייקט parsed
        let resData = response.data;
        if (typeof resData === 'string') {
            resData = JSON.parse(resData);
        }

        let minyanim = [];
        let seenMinyanim = new Set(); // כלי מהיר למניעת כפילויות ברמת שורה

        // 2. סריקה ופענוח של ה-JSON המקונן מתוך השרת
        if (resData && resData.All_Styles_Elements) {
            const elements = typeof resData.All_Styles_Elements === 'string' 
                ? JSON.parse(resData.All_Styles_Elements) 
                : resData.All_Styles_Elements;

            const jsonIdx = elements.columns.indexOf("JSON");
            const nameIdx = elements.columns.indexOf("Name");

            for (let row of elements.data) {
                const elementName = row[nameIdx] || "";
                
                // סינון השורות הרלוונטיות שמכילות לוחות זמני תפילות (חול / שבת / המניין הבא)
                if (elementName.includes("מנין") || elementName.includes("מניין") || elementName.includes("תפיל") || elementName.includes("חול")) {
                    const jsonStr = row[jsonIdx];
                    if (!jsonStr) continue;

                    try {
                        const innerObj = JSON.parse(jsonStr);
                        if (innerObj && innerObj.columns && innerObj.data) {
                            const innerNameIdx = innerObj.columns.indexOf("Name");
                            const innerTimeIdx = innerObj.columns.indexOf("Time_View");
                            const innerIsTitleIdx = innerObj.columns.indexOf("Is_Title");

                            for (let innerRow of innerObj.data) {
                                // דילוג על שורות שהן כותרות בלבד (ללא זמן אמיתי)
                                if (innerIsTitleIdx !== -1 && innerRow[innerIsTitleIdx] === true) continue;

                                const name = innerRow[innerNameIdx];
                                const timeStr = innerRow[innerTimeIdx];

                                // וודוא שיש שעה תקינה בפורמט HH:MM
                                if (!name || !timeStr || !timeStr.includes(':')) continue;

                                // מניעת כפילויות מיידית: אם השם והשעה כבר קיימים, מדלגים הלאה
                                const minyanKey = `${name.trim()}_${timeStr.trim()}`;
                                if (seenMinyanim.has(minyanKey)) continue;
                                seenMinyanim.add(minyanKey);

                                const parts = timeStr.split(':');
                                const currentMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

                                minyanim.push({
                                    type: name.trim(),
                                    shul: '', 
                                    location: '',
                                    time: timeStr.trim(),
                                    minutes: currentMinutes
                                });
                            }
                        }
                    } catch (e) {
                        // דילוג במקרה של שגיאת פענוח פנימית בשורה ספציפית
                    }
                }
            }
        }

        if (minyanim.length === 0) {
            return res.send(`id_list_message=t-לא נמצאו מניינים מעודכנים בלוח&hangup=yes`);
        }

        // 3. מיון המניינים לפי סדר כרונולוגי של שעות היום (קריטי להשוואת המניין הקרוב)
        minyanim.sort((a, b) => a.minutes - b.minutes);
        
        // 4. מציאת המניין הראשון ששעתו שווה או גדולה מהשעה הנוכחית
        let startIndex = minyanim.findIndex(m => m.minutes >= curMin);
        let isTomorrow = false;

        if (startIndex === -1) {
            startIndex = 0;
            isTomorrow = true; // אם עברנו את המניין האחרון להיום, נציג את המניין הראשון של מחר
        }

        let currentIndex = startIndex;

        // ניווט במערכת הטלפונית על בסיס היסטוריית ההקשות
        for (let move of history) {
            if (move === '1') { 
                if (currentIndex < minyanim.length - 1) currentIndex++;
            } else if (move === '2') { 
                if (currentIndex > 0) currentIndex--;
            }
        }

        const lastMove = history.length > 0 ? history[history.length - 1] : null;

        if (lastMove === '4') {
            return res.send(`id_list_message=t-להתראות&hangup=yes`);
        }

        let textToRead = "";
        
        if (lastMove === '3') {
            // הקראה של כל המניינים ברצף
            let all = minyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
            textToRead = cleanForTTS("רשימת כל המניינים היא: " + all);
        } else {
            // הקראת המניין הספציפי הנוכחי
            const m = minyanim[currentIndex];
            let prefix = "";
            
            if (history.length === 0) {
                prefix = isTomorrow ? "לא נותרו מניינים להיום. מנייני מחר הם: " : "המניין הקרוב ביותר הוא: ";
            } else {
                if (currentIndex === 0 && lastMove === '2') prefix = "זהו המניין הראשון. ";
                if (currentIndex === minyanim.length - 1 && lastMove === '1') prefix = "זהו המניין האחרון. ";
            }

            textToRead = cleanForTTS(`${prefix} תפילת ${m.type} בשעה ${m.time}`);
        }

        const menu = cleanForTTS("לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל המניינים שלוש. ליציאה ארבע.");
        const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
        
        res.send(responseString);
        console.log(`[LOG] הושמע בהצלחה: ${textToRead}`);

    } catch (error) {
        console.error("[ERROR] שגיאה בקבלת או עיבוד הנתונים:", error.message);
        res.send(`id_list_message=t-שגיאה בתקשורת עם שרת הלוח&hangup=yes`);
    }
});

app.listen(port, () => console.log(`Minyanim Server is running on port ${port}`));
