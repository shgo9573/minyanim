require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// פונקציה חכמה לפתיחת ראשי תיבות וניקוי טקסט להקראה קולית ברורה
function cleanForTTS(str) {
    if (!str) return '';
    
    // הסרת גרשיים מיוחדים וסלאשים של מערכת הנתונים
    let cleaned = str.replace(/\\+/g, '').replace(/"/g, '');
    
    // מילון מקיף לפתיחת ראשי תיבות של עולם התפילה והשבת
    const replacements = [
        { pattern: /שעש["׳״]?ק/g, replace: "שערב שבת קודש" },
        { pattern: /עש["׳״]?ק/g, replace: "ערב שבת קודש" },
        { pattern: /ששב["׳״]?ק/g, replace: "ששבת קודש" },
        { pattern: /שב["׳״]?ק/g, replace: "שבת קודש" },
        { pattern: /מוצ["׳״]?ש/g, replace: "מוצאי שבת" },
        { pattern: /הדל["׳״]?נ/g, replace: "הדלקת נרות" },
        { pattern: /בימ["׳״]?ד/g, replace: "בית המדרש" },
        { pattern: /עז["׳״]?נ/g, replace: "עזרת נשים" },
        { pattern: /דק['״׳]/g, replace: "דקות" },
        { pattern: /שחרית\s+א['׳]\s*-\s*נץ/g, replace: "שחרית א הנץ החמה" },
        { pattern: /נץ/g, replace: "הנץ החמה" },
        { pattern: /ביה["׳״]?ז/g, replace: "בין הזמנים" },
        { pattern: /ר["׳״]?ח/g, replace: "ראש חודש" },
        { pattern: /יו["׳״]?ט/g, replace: "יום טוב" },
        { pattern: /עיו["׳״]?ט/g, replace: "ערב יום טוב" },
        { pattern: /יו["׳״]?כ/g, replace: "יום כיפור" },
        { pattern: /ר["׳״]?ה/g, replace: "ראש השנה" },
        { pattern: /פר["׳״]?ש/g, replace: "פרשת השבוע" },
        { pattern: /משנ["׳״]?ב/g, replace: "משנה ברורה" },
        { pattern: /ק["׳״]?ד/g, replace: "קומה ד" },
        { pattern: /ע["׳״]?ש/g, replace: "ערב שבת" },
        { pattern: /ק["׳״]?ש/g, replace: "קריאת שמע" },
        { pattern: /גר["׳״]?א/g, replace: "הגר א" },
        { pattern: /מג["׳״]?א/g, replace: "מגן אברהם" },
        { pattern: /סזק["׳״]?ש/g, replace: "סוף זמן קריאת שמע" },
        { pattern: /סז["׳״]?ת/g, replace: "סוף זמן תפילה" },
        { pattern: /בה["׳״]?ח/g, replace: "הבחור החשוב" },
        { pattern: /ע["׳״]?ה/g, replace: "עליה השלום" },
        { pattern: /זצ["׳״]?ל/g, replace: "זכר צדיק לברכה" },
        { pattern: /ני["׳״]?ו/g, replace: "נרו יאיר ויזרח" },
        { pattern: /עב["׳״]?ג/g, replace: "עם בת גילו" },
        { pattern: /לע["׳״]?נ/g, replace: "לעילוי נשמת" },
        { pattern: /ב["׳״]?ר/g, replace: "בן רבי" },
        { pattern: /ש["׳״]?ק/g, replace: "שבת קודש" }
    ];

    replacements.forEach(({ pattern, replace }) => {
        cleaned = cleaned.replace(pattern, replace);
    });

    // הסרת תווים מיוחדים שמפריעים למנוע ההקראה (TTS)
    return cleaned.replace(/[.\-"&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

// פונקציה מרכזית למשיכת הנתונים וחלוקתם חול/שבת בצורה בטוחה
async function fetchAndParseMinyanim() {
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    
    const lyear = israelTime.getFullYear();
    const lmonth = israelTime.getMonth() + 1; 
    const lday = israelTime.getDate();

    const TARGET_URL = `https://zmanimboard.com/GetAllClientData.aspx/?CL_ID=1287&Lyear=${lyear}&Lmonth=${lmonth}&Lday=${lday}&UserPass=Bc3456`;
    
    const response = await axios.get(TARGET_URL);
    let resData = response.data;
    if (typeof resData === 'string') {
        resData = JSON.parse(resData);
    }

    let weekdayMinyanim = [];
    let shabbatMinyanim = [];
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

                // קביעת ברירת מחדל חכמה לפי סוג האלמנט האב (למניעת ערבוב כשעמודת ה-Mark ריקה)
                let defaultIsWeekday = true;
                if (elementName.includes("שבת") || elementName.includes("שב\"ק")) {
                    defaultIsWeekday = false;
                }

                try {
                    const innerObj = JSON.parse(jsonStr);
                    if (innerObj && innerObj.columns && innerObj.data) {
                        const innerNameIdx = innerObj.columns.indexOf("Name");
                        const innerTimeIdx = innerObj.columns.indexOf("Time_View");
                        const innerIsTitleIdx = innerObj.columns.indexOf("Is_Title");
                        const innerMarkIdx = innerObj.columns.indexOf("Mark");

                        for (let innerRow of innerObj.data) {
                            if (innerIsTitleIdx !== -1 && innerRow[innerIsTitleIdx] === true) continue;

                            const name = innerRow[innerNameIdx];
                            const timeStr = innerRow[innerTimeIdx];
                            
                            // מנגנון חילוץ בטוח לערך ה-Mark (מתמודד עם בוליאני, מחרוזת ומספרים)
                            let isWeekday = defaultIsWeekday;
                            if (innerMarkIdx !== -1 && innerRow[innerMarkIdx] !== null && innerRow[innerMarkIdx] !== undefined && innerRow[innerMarkIdx] !== '') {
                                const rawMark = String(innerRow[innerMarkIdx]).trim().toLowerCase();
                                if (rawMark === 'false' || rawMark === '0') {
                                    isWeekday = false;
                                } else if (rawMark === 'true' || rawMark === '1') {
                                    isWeekday = true;
                                }
                            }

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

                            if (isWeekday) {
                                weekdayMinyanim.push(minyanObject);
                            } else {
                                shabbatMinyanim.push(minyanObject);
                            }
                        }
                    }
                } catch (e) {}
            }
        }
    }
    
    weekdayMinyanim.sort((a, b) => a.minutes - b.minutes);
    shabbatMinyanim.sort((a, b) => a.minutes - b.minutes);

    return { weekdayMinyanim, shabbatMinyanim, israelTime };
}


// ==========================================
// 1. הנתיב הראשי: משולב (חול ושבת לפי שעות המעבר)
// ==========================================
app.get('/minyan', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const timeLog = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

    console.log(`\n\n========== [${timeLog}] פנייה חדשה: משולב חול/שבת ==========`);
    
    let history = [];
    if (Array.isArray(req.query.menu_choice)) {
        history = req.query.menu_choice;
    } else if (req.query.menu_choice) {
        history = [req.query.menu_choice];
    }

    try {
        const { weekdayMinyanim, shabbatMinyanim, israelTime } = await fetchAndParseMinyanim();
        const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
        const dayOfWeek = israelTime.getDay();
        const currentHour = israelTime.getHours();

        // הגדרת מצב שבת/חול לפי השעות שביקשת
        let isShabbatMode = false;
        if (dayOfWeek === 5) {
            isShabbatMode = (currentHour >= 14); // יום שישי החל מ-14:00 עובר לשבת
        } else if (dayOfWeek === 6) {
            isShabbatMode = (currentHour < 19);  // יום שבת עד 19:00 מציג שבת
        } else {
            isShabbatMode = false;
        }

        if (weekdayMinyanim.length === 0 && shabbatMinyanim.length === 0) {
            return res.send(`id_list_message=t-לא נמצאו מניינים מעודכנים בלוח&hangup=yes`);
        }

        const activeMinyanim = isShabbatMode ? shabbatMinyanim : weekdayMinyanim;
        const currentModeLabel = isShabbatMode ? "שבת" : "חול";

        let startIndex = activeMinyanim.findIndex(m => m.minutes >= curMin);
        let isTomorrow = false;

        if (startIndex === -1) {
            startIndex = 0;
            isTomorrow = true; 
        }

        let currentIndex = startIndex;

        for (let move of history) {
            if (move === '1') { 
                if (currentIndex < activeMinyanim.length - 1) currentIndex++;
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
            if (weekdayMinyanim.length === 0) {
                textToRead = "לא נמצאו מנייני חול מוגדרים בלוח.";
            } else {
                let all = weekdayMinyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
                textToRead = cleanForTTS("רשימת כל מנייני החול היא: " + all);
            }
        } else if (lastMove === '5') {
            if (shabbatMinyanim.length === 0) {
                textToRead = "לא נמצאו מנייני שבת מוגדרים בלוח.";
            } else {
                let allShabbat = shabbatMinyanim.map(m => `${m.type} בשעה ${m.time}`).join('. ');
                textToRead = cleanForTTS("מנייני השבת הם: " + allShabbat);
            }
        } else {
            const m = activeMinyanim[currentIndex];
            let prefix = "";
            
            if (history.length === 0) {
                if (isShabbatMode) {
                    prefix = isTomorrow ? "תפילת השבת הבאה היא: " : "המניין הבא לשבת הוא: ";
                } else {
                    // הוסרה המילה "לחול" לבקשתך
                    prefix = isTomorrow ? "לא נותרו מניינים להיום. מנייני מחר הם: " : "המניין הקרוב ביותר הוא: ";
                }
            } else {
                if (currentIndex === 0 && lastMove === '2') prefix = `זהו מניין ה${currentModeLabel} הראשון. `;
                if (currentIndex === activeMinyanim.length - 1 && lastMove === '1') prefix = `זהו מניין ה${currentModeLabel} האחרון. `;
            }

            textToRead = cleanForTTS(`${prefix} תפילת ${m.type} בשעה ${m.time}`);
        }

        const menu = cleanForTTS("לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל מנייני החול שלוש. למנייני שבת חמש. ליציאה ארבע.");
        const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
        
        res.send(responseString);
        console.log(`[LOG] הושמע: ${textToRead}`);

    } catch (error) {
        console.error("[ERROR]", error.message);
        res.send(`id_list_message=t-שגיאה בתקשורת עם שרת הלוח&hangup=yes`);
    }
});


// ==========================================
// 2. הקישור הייעודי: שבת בלבד (הקראה מלאה ברצף)
// ==========================================
app.get('/shabbat', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const timeLog = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

    console.log(`\n\n========== [${timeLog}] פנייה חדשה: שבת בלבד (הקראה מלאה ברצף) ==========`);
    
    let history = [];
    if (Array.isArray(req.query.menu_choice)) {
        history = req.query.menu_choice;
    } else if (req.query.menu_choice) {
        history = [req.query.menu_choice];
    }

    try {
        const { shabbatMinyanim } = await fetchAndParseMinyanim();

        if (shabbatMinyanim.length === 0) {
            return res.send(`id_list_message=t-לא נמצאו מנייני שבת מוגדרים בלוח&hangup=yes`);
        }

        const lastMove = history.length > 0 ? history[history.length - 1] : null;

        if (lastMove === '4') {
            return res.send(`id_list_message=t-להתראות&hangup=yes`);
        }

        // מקריא ישירות את כל המניינים ברצף ללא מציאת המניין הקרוב ביותר
        let allShabbat = shabbatMinyanim.map(m => `${m.type} בשעה ${m.time}`).join('. ');
        let textToRead = cleanForTTS("מנייני השבת הם: " + allShabbat);

        // תפריט פשוט לשמיעה חוזרת או יציאה
        const menu = cleanForTTS("לשמיעה חוזרת הקש אפס. ליציאה ארבע.");
        const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
        
        res.send(responseString);
        console.log(`[LOG - שבת] הושמע: ${textToRead}`);

    } catch (error) {
        console.error("[ERROR - שבת]", error.message);
        res.send(`id_list_message=t-שגיאה בתקשורת עם שרת הלוח&hangup=yes`);
    }
});

app.listen(port, () => console.log(`Minyanim Server running on port ${port}`));
