require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// פונקציה משודרגת לניקוי והרחבת ראשי תיבות עבור מנוע הדיבור (TTS)
function cleanForTTS(str) {
    if (!str) return '';
    
    // 1. ניקוי סימני מילוט וגרשיים משובשים מה-JSON (כמו \\\" וכדומה)
    let cleaned = str.replace(/\\+/g, '').replace(/"/g, '');
    
    // 2. הפיכת ראשי תיבות למילים מלאות כדי שהמערכת תקריא נכון
    cleaned = cleaned.replace(/ב?בימ["׳״]?ד/g, (match) => match.startsWith('ב') ? 'בבית המדרש' : 'בית המדרש');
    cleaned = cleaned.replace(/עז["׳״]?נ/g, 'עזרת נשים');
    cleaned = cleaned.replace(/ק\s*ד['״׳]?/g, 'קומה ד'); // הפיכת ק ד' לקומה ד
    
    // 3. החלפת תווים מיוחדים מציקים ברווחים
    cleaned = cleaned.replace(/[.\-"&%=_]/g, ' ');
    
    // 4. צמצום רווחים כפולים שנוצרו מהניקוי
    return cleaned.replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const timeLog = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

    console.log(`\n\n========== [${timeLog}] פנייה חדשה ומסוננת ==========`);
    
    let history = [];
    if (Array.isArray(req.query.menu_choice)) {
        history = req.query.menu_choice;
    } else if (req.query.menu_choice) {
        history = [req.query.menu_choice];
    }

    try {
        const now = new Date();
        const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
        
        const lyear = israelTime.getFullYear();
        const lmonth = israelTime.getMonth() + 1; 
        const lday = israelTime.getDate();
        const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

        const TARGET_URL = `https://zmanimboard.com/GetAllClientData.aspx/?CL_ID=1287&Lyear=${lyear}&Lmonth=${lmonth}&Lday=${lday}&UserPass=Bc3456`;
        
        const response = await axios.get(TARGET_URL);
        
        let resData = response.data;
        if (typeof resData === 'string') {
            resData = JSON.parse(resData);
        }

        let minyanim = [];
        let seenMinyanim = new Set(); // סט שמטרתו למנוע כפילויות בהקראה

        if (resData && resData.All_Styles_Elements) {
            const elements = typeof resData.All_Styles_Elements === 'string' 
                ? JSON.parse(resData.All_Styles_Elements) 
                : resData.All_Styles_Elements;

            const jsonIdx = elements.columns.indexOf("JSON");
            const nameIdx = elements.columns.indexOf("Name");

            for (let row of elements.data) {
                const elementName = row[nameIdx] || "";
                
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
                                if (innerIsTitleIdx !== -1 && innerRow[innerIsTitleIdx] === true) continue;

                                const rawName = innerRow[innerNameIdx];
                                const timeStr = innerRow[innerTimeIdx];

                                if (!rawName || !timeStr || !timeStr.includes(':')) continue;

                                // ניקוי והרחבת ראשי התיבות כבר בשלב החילוץ
                                const cleanName = cleanForTTS(rawName);
                                const cleanTime = timeStr.trim();

                                // מפתח ייחודי למניעת כפילויות (שם נקי + שעה)
                                const minyanKey = `${cleanName}_${cleanTime}`;
                                
                                if (seenMinyanim.has(minyanKey)) {
                                    continue; // אם המניין כבר קיים, דלג עליו ולא יוכנס שוב!
                                }
                                seenMinyanim.add(minyanKey);

                                const parts = cleanTime.split(':');
                                const currentMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

                                minyanim.push({
                                    type: cleanName,
                                    time: cleanTime,
                                    minutes: currentMinutes
                                });
                            }
                        }
                    } catch (e) {
                        // דילוג על שורות לא תקינות
                    }
                }
            }
        }

        if (minyanim.length === 0) {
            return res.send(`id_list_message=t-לא נמצאו מניינים מעודכנים בלוח&hangup=yes`);
        }

        // מיון כרונולוגי של המניינים הייחודיים
        minyanim.sort((a, b) => a.minutes - b.minutes);
        
        let startIndex = minyanim.findIndex(m => m.minutes >= curMin);
        let isTomorrow = false;

        if (startIndex === -1) {
            startIndex = 0;
            isTomorrow = true; 
        }

        let currentIndex = startIndex;

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
            // הקראת כל המניינים ללא כפילויות
            let all = minyanim.map(m => `${m.type} בשעה ${m.time}`).join('. ');
            textToRead = "רשימת כל המניינים היא: " + all;
        } else {
            const m = minyanim[currentIndex];
            let prefix = "";
            
            if (history.length === 0) {
                prefix = isTomorrow ? "לא נותרו מניינים להיום. מנייני מחר הם: " : "המניין הקרוב ביותר הוא: ";
            } else {
                if (currentIndex === 0 && lastMove === '2') prefix = "זהו המניין הראשון. ";
                if (currentIndex === minyanim.length - 1 && lastMove === '1') prefix = "זהו המניין האחרון. ";
            }

            textToRead = `${prefix} ${m.type} בשעה ${m.time}`;
        }

        const menu = "לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל המניינים שלוש. ליציאה ארבע.";
        const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
        
        res.send(responseString);
        console.log(`[LOG] הושמע נקי: ${textToRead}`);

    } catch (error) {
        console.error("[ERROR] שגיאה:", error.message);
        res.send(`id_list_message=t-שגיאה בתקשורת עם שרת הלוח&hangup=yes`);
    }
});

// התאמה ל-Vercel או הרצה מקומית
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`Minyanim Server running on port ${port}`));
}
module.exports = app;
