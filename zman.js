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
    
    // מילון מקיף לפתיחת ראשי תיבות של עולם התפילה והשבת - מוגן מפני שיבושים והחלפות כפולות
    const replacements = [
        { pattern: /(?<![א-ת])שעש["׳״]?ק(?![א-ת])/g, replace: "שערב שבת קודש" },
        { pattern: /(?<![א-ת])עש["׳״]?ק(?![א-ת])/g, replace: "ערב שבת קודש" },
        { pattern: /(?<![א-ת])ששב["׳״]?ק(?![א-ת])/g, replace: "ששבת קודש" },
        { pattern: /(?<![א-ת])שב["׳״]?ק(?![א-ת])/g, replace: "שבת קודש" },
        { pattern: /(?<![א-ת])מוצ["׳״]?ש(?![א-ת])/g, replace: "מוצאי שבת" },
        { pattern: /(?<![א-ת])הדל["׳״]?נ(?![א-ת])/g, replace: "הדלקת נרות" },
        { pattern: /(?<![א-ת])בימ["׳״]?ד(?![א-ת])/g, replace: "בית המדרש" },
        { pattern: /(?<![א-ת])עז["׳״]?נ(?![א-ת])/g, replace: "עזרת נשים" },
        { pattern: /(?<![א-ת])דק['״׳](?![א-ת])/g, replace: "דקות" },
        
        // הגנה מיוחדת על נץ / הנץ שלא יבצע החלפה כפולה אם הביטוי "החמה" כבר מופיע
        { pattern: /(?<![א-ת])ה?נץ(?!\s*החמה)(?![א-ת])/g, replace: "הנץ החמה" },
        
        { pattern: /(?<![א-ת])ביה["׳״]?ז(?![א-ת])/g, replace: "בין הזמנים" },
        { pattern: /(?<![א-ת])ר["׳״]?ח(?![א-ת])/g, replace: "ראש חודש" },
        { pattern: /(?<![א-ת])יו["׳״]?ט(?![א-ת])/g, replace: "יום טוב" },
        { pattern: /(?<![א-ת])עיו["׳״]?ט(?![א-ת])/g, replace: "ערב יום טוב" },
        { pattern: /(?<![א-ת])יו["׳״]?כ(?![א-ת])/g, replace: "יום כיפור" },
        { pattern: /(?<![א-ת])ר["׳״]?ה(?![א-ת])/g, replace: "ראש השנה" },
        { pattern: /(?<![א-ת])פר["׳״]?ש(?![א-ת])/g, replace: "פרשת השבוע" },
        { pattern: /(?<![א-ת])משנ["׳״]?ב(?![א-ת])/g, replace: "משנה ברורה" },
        { pattern: /(?<![א-ת])ק["׳״]?ד(?![א-ת])/g, replace: "קומה ד" },
        { pattern: /(?<![א-ת])ע["׳״]?ש(?![א-ת])/g, replace: "ערב שבת" },
        { pattern: /(?<![א-ת])ק["׳״]?ש(?![א-ת])/g, replace: "קריאת שמע" },
        { pattern: /(?<![א-ת])גר["׳״]?א(?![א-ת])/g, replace: "הגר א" },
        { pattern: /(?<![א-ת])מג["׳״]?א(?![א-ת])/g, replace: "מגן אברהם" },
        { pattern: /(?<![א-ת])סזק["׳״]?ש(?![א-ת])/g, replace: "סוף זמן קריאת שמע" },
        { pattern: /(?<![א-ת])סז["׳״]?ת(?![א-ת])/g, replace: "סוף זמן תפילה" },
        { pattern: /(?<![א-ת])בה["׳״]?ח(?![א-ת])/g, replace: "הבחור החשוב" },
        
        // הגנה קריטית על ע"ה שלא יחליף את הסוף של המילה "בשעה"
        { pattern: /(?<![א-ת])ע["׳״]?ה(?![א-ת])/g, replace: "עליה השלום" },
        
        { pattern: /(?<![א-ת])זצ["׳״]?ל(?![א-ת])/g, replace: "זכר צדיק לברכה" },
        { pattern: /(?<![א-ת])ני["׳״]?ו(?![א-ת])/g, replace: "נרו יאיר ויזרח" },
        { pattern: /(?<![א-ת])עב["׳״]?ג(?![א-ת])/g, replace: "עם בת גילו" },
        { pattern: /(?<![א-ת])לע["׳״]?נ(?![א-ת])/g, replace: "לעילוי נשמת" },
        { pattern: /(?<![א-ת])ב["׳״]?ר(?![א-ת])/g, replace: "בן רבי" },
        { pattern: /(?<![א-ת])ש["׳״]?ק(?![א-ת])/g, replace: "שבת קודש" }
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
    const dayOfWeek = israelTime.getDay(); // 0 = ראשון, 5 = שישי, 6 = שבת

    console.log(`[LOG] תאריך השרת הנוכחי (שעון ישראל): ${israelTime.toString()}`);
    console.log(`[LOG] תאריך חילוץ ללוח: Lday=${lday}, Lmonth=${lmonth}, Lyear=${lyear} | יום בשבוע: ${dayOfWeek}`);

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
            const nameCleaned = elementName.trim();
            
            // סינון קשוח: מושך נתונים אך ורק מהאלמנט המרכזי "המניין הבא" או "המנין הבא"
            if (nameCleaned === "המניין הבא" || nameCleaned === "המנין הבא") {
                const jsonStr = row[jsonIdx];
                if (!jsonStr) continue;

                try {
                    const innerObj = JSON.parse(jsonStr);
                    if (innerObj && innerObj.columns && innerObj.data) {
                        // איתור אינדקסים בצורה בטוחה שאינה תלויה באותיות רישיות/קטנות או רווחים
                        const innerNameIdx = innerObj.columns.findIndex(col => col.trim().toLowerCase() === "name");
                        const innerTimeIdx = innerObj.columns.findIndex(col => col.trim().toLowerCase() === "time_view");
                        const innerIsTitleIdx = innerObj.columns.findIndex(col => col.trim().toLowerCase() === "is_title");
                        const innerMarkIdx = innerObj.columns.findIndex(col => col.trim().toLowerCase() === "mark");

                        for (let innerRow of innerObj.data) {
                            if (innerIsTitleIdx !== -1 && innerRow[innerIsTitleIdx] === true) continue;

                            const name = innerRow[innerNameIdx];
                            const timeStr = innerRow[innerTimeIdx];
                            
                            // מנגנון חילוץ בטוח לערך ה-Mark (מתמודד עם בוליאני, מחרוזת ומספרים)
                            let isWeekday = true; 
                            if (innerMarkIdx !== -1 && innerRow[innerMarkIdx] !== null && innerRow[innerMarkIdx] !== undefined && innerRow[innerMarkIdx] !== '') {
                                const rawMark = String(innerRow[innerMarkIdx]).trim().toLowerCase();
                                if (rawMark === 'false' || rawMark === '0') {
                                    isWeekday = false;
                                } else if (rawMark === 'true' || rawMark === '1') {
                                    isWeekday = true;
                                }
                            }

                            if (!name || !timeStr || !timeStr.includes(':')) continue;

                            // שסתום ביטחון מבוסס שמות: תפילות השייכות לשבת יסווגו כשבת בכל מקרה
                            const cleanName = name.trim();
                            if (
                                cleanName.includes('עש"ק') || 
                                cleanName.includes('עשק') || 
                                cleanName.includes('הדל"נ') || 
                                cleanName.includes('מוצ"ש') || 
                                cleanName.includes('מוצש') || 
                                cleanName.includes('אבות ובנים') ||
                                cleanName === 'מעריב' || // ערבית ליל שבת
                                (cleanName.startsWith('שחרית') && !cleanName.includes('-')) // שחרית א' / ב' של שבת לעומת "שחרית א'-נץ" של חול
                            ) {
                                isWeekday = false;
                            }

                            const minyanKey = `${cleanName}_${timeStr.trim()}`;
                            if (seenMinyanim.has(minyanKey)) continue;
                            seenMinyanim.add(minyanKey);

                            const parts = timeStr.split(':');
                            const currentMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

                            const minyanObject = {
                                type: cleanName,
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
    
    // מיון כרונולוגי של מנייני החול
    weekdayMinyanim.sort((a, b) => a.minutes - b.minutes);

    // מנגנון מיזוג חכם ליום שישי:
    // מחבר את תפילות שחרית חול של יום שישי, יחד עם מנחה של ערב שבת וערבית של ליל שבת, לציר זמן אחד מושלם!
    if (dayOfWeek === 5) {
        const fridayShabbatPrayers = shabbatMinyanim.filter(m => 
            m.type.includes('עש"ק') || 
            m.type.includes('עשק') || 
            m.type.includes('הדל"נ') || 
            m.type === 'מעריב' ||
            (m.type === 'שקיעה' && m.minutes < 1185) // שקיעה של ערב שבת (19:44)
        );
        
        weekdayMinyanim = [...weekdayMinyanim, ...fridayShabbatPrayers];
        // מיון כרונולוגי מחדש של יום שישי המשולב והשלם
        weekdayMinyanim.sort((a, b) => a.minutes - b.minutes);
    }

    // מנייני השבת (שבת בוקר עד מוצ"ש) נשארים ללא מיון כדי לשמור על הסדר המקורי של הלוח
    return { weekdayMinyanim, shabbatMinyanim, israelTime };
}


// ==========================================
// 1. הנתיב הראשי: משולב (חול ושבת לפי השעות שביקשת)
// ==========================================
app.get('/minyan', async (req, res) => {
    // מניעת שמירה בזיכרון (Cache) של ימות המשיח או כל שרת בדרך [1]
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // מניעת קאש מוחלטת [1]
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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

        // מציאת האינדקס של המניין הבא
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
                    prefix = isTomorrow ? "לא נותרו מניינים להיום. מנייני מחר הם: " : "המניין הקרוב ביותר הוא: ";
                }
            } else {
                if (currentIndex === 0 && lastMove === '2') prefix = `זהו מניין ה${currentModeLabel} הראשון. `;
                if (currentIndex === activeMinyanim.length - 1 && lastMove === '1') prefix = `זהו מניין ה${currentModeLabel} האחרון. `;
            }

            textToRead = cleanForTTS(`${prefix} תפילת ${m.type} בשעה ${m.time}`);
        }

        // שינוי הפרמטרים של read ל- "no" ו- "No" כדי לבטל אישורי הקשה מעצבנים בימות המשיח
        const menu = cleanForTTS("לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל מנייני החול שלוש. למנייני שבת חמש. ליציאה ארבע.");
        const responseString = `read=t-${textToRead} ${menu}=menu_choice,no,1,1,7,No,No,`;
        
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
    // מניעת שמירה בזיכרון (Cache) של ימות המשיח או כל שרת בדרך [1]
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // מניעת קאש מוחלטת [1]
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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

        const lastMove = hist
