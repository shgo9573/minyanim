require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

function cleanForTTS(str) {
    if (!str) return '';
    
    let cleaned = str.replace(/\\+/g, '').replace(/"/g, '');
    
    // הפיכת ראשי תיבות למילים מלאות
    cleaned = cleaned.replace(/ב?בימ["׳״]?ד/g, (match) => match.startsWith('ב') ? 'בבית המדרש' : 'בית המדרש');
    cleaned = cleaned.replace(/עז["׳״]?נ/g, 'עזרת נשים');
    cleaned = cleaned.replace(/ק\s*ד['״׳]?/g, 'קומה ד');
    
    return cleaned.replace(/[.\-"&%=]/g, ' ').replace(/\s+/g, ' ').trim();
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

        let weekdayMinyanim = []; // מנייני חול
        let shabbatMinyanim = []; // מנייני שבת
        let seenMinyanim = new Set(); 

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

                                const name = innerRow[innerNameIdx];
                                const timeStr = innerRow[innerTimeIdx];

                                if (!name || !timeStr || !timeStr.includes(':')) continue;

                                const minyanKey = `${name.trim()}_${timeStr.trim()}`;
                                if (seenMinyanim.has(minyanKey)) continue;
                                seenMinyanim.add(minyanKey);

                                const parts = timeStr.split(':');
                                const currentMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

                                const minyanObject = {
                                    type: name.trim(),
                                    time: timeStr.trim(),
                                    minutes: currentMinutes
                                };

                                // מיון מוקדם: אם השם מכיל "שבת", זה הולך לרשימת שבת, אחרת לחול
                                if (name.includes("שבת")) {
                                    shabbatMinyanim.push(minyanObject);
                                } else {
                                    weekdayMinyanim.push(minyanObject);
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        // מיון כרונולוגי של שתי הרשימות בנפרד
        weekdayMinyanim.sort((a, b) => a.minutes - b.minutes);
        shabbatMinyanim.sort((a, b) => a.minutes - b.minutes);

        if (weekdayMinyanim.length === 0 && shabbatMinyanim.length === 0) {
            return res.send(`id_list_message=t-לא נמצאו מניינים מעודכנים בלוח&hangup=yes`);
        }

        // כברירת מחדל מנווטים במנייני חול
        let startIndex = weekdayMinyanim.findIndex(m => m.minutes >= curMin);
        let isTomorrow = false;

        if (startIndex === -1) {
            startIndex = 0;
            isTomorrow = true; 
        }

        let currentIndex = startIndex;

        // ניווט לפי היסטוריית הקשות
        for (let move of history) {
            if (move === '1') { 
                if (currentIndex < weekdayMinyanim.length - 1) currentIndex++;
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
            // הקראת כל מנייני החול
            let all = weekdayMinyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
            textToRead = cleanForTTS("רשימת כל מנייני החול היא: " + all);
        } else if (lastMove === '5') {
            // הקראת כל מנייני השבת
            if (shabbatMinyanim.length === 0) {
                textToRead = "לא נמצאו מנייני שבת מוגדרים בלוח.";
            } else {
                let allShabbat = shabbatMinyanim.map(m => `${m.type} בשעה ${m.time}`).join('. ');
                textToRead = cleanForTTS("מנייני השבת הם: " + allShabbat);
            }
        } else {
            // המניין הקרוב (מחול)
            const m = weekdayMinyanim[currentIndex];
            let prefix = "";
            
            if (history.length === 0) {
                prefix = isTomorrow ? "לא נותרו מניינים להיום. מנייני מחר הם: " : "המניין הקרוב ביותר הוא: ";
            } else {
                if (currentIndex === 0 && lastMove === '2') prefix = "זהו מניין החול הראשון. ";
                if (currentIndex === weekdayMinyanim.length - 1 && lastMove === '1') prefix = "זהו מניין החול האחרון. ";
            }

            textToRead = cleanForTTS(`${prefix} תפילת ${m.type} בשעה ${m.time}`);
        }

        // עדכון התפריט הקולי שיכלול את מקש 5
        const menu = cleanForTTS("לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל מנייני החול שלוש. למנייני שבת חמש. ליציאה ארבע.");
        const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
        
        res.send(responseString);
        console.log(`[LOG] הושמע: ${textToRead}`);

    } catch (error) {
        console.error("[ERROR]", error.message);
        res.send(`id_list_message=t-שגיאה בתקשורת עם שרת הלוח&hangup=yes`);
    }
});

app.listen(port, () => console.log(`Minyanim Server running on port ${port}`));
