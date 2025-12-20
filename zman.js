require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// =================================================================
// הגדרות מערכת המניינים
// =================================================================

// *** חשוב: החלף את הקישור הזה לקישור ה-RAW של הקובץ שלך מגיטהאב ***
const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/_%D7%96%D7%9E%D7%A0%D7%99%20%D7%94%D7%AA%D7%A4%D7%99%D7%9C%D7%95%D7%AA%20-%20%D7%92%D7%99%D7%9C%D7%99%D7%95%D7%9F1.csv'; 

// הטוקן של ימות המשיח
const YM_TOKEN = 'WU1BUElL.apik_kNbTY_I7Td_LuLj4UMfONw.QH7FNDjik2-tunq5XCLZD_JYxiyU8SKXP58QHsCX60E';

// =================================================================
// נתיב 1: מערכת המניינים (CSV)
// הקישור בימות המשיח יהיה: YourURL/minyan
// =================================================================
app.get('/minyan', async (req, res) => {
  const phone = req.query.api_phone || '000000'; // מספר הטלפון של המתקשר
  
  console.log(`New request from ${phone} for minyan check`);

  try {
    // 1. משיכת הנתונים מהקובץ בגיטהאב
    const response = await axios.get(CSV_URL);
    const csvData = response.data;

    // 2. חישוב זמן נוכחי (מותאם לשעון ישראל)
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
    
    console.log(`Current Israel Time (minutes): ${curMin}`);

    let bestText = "לא נמצאו מניינים נוספים להיום";
    let minDiff = 1440; // איפוס למקסימום דקות ביממה

    // 3. פירוק ה-CSV
    const rows = csvData.split('\n'); 

    // מתחילים מ-1 כדי לדלג על הכותרת (סוג התפילה, בית כנסת...)
    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row) continue;

      // טיפול בגרשיים ופסיקים (מנקה גרשיים כפולים של CSV)
      // דוגמה לשורה: ,קהילת בני תורה,"ביהמ""ד ""ים התלמוד""",06:25
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // פיצול חכם שמתעלם מפסיקים בתוך גרשיים
      
      if (columns.length < 4) continue;

      // ניקוי המרכאות מהטקסטים
      const clean = (str) => str ? str.replace(/"/g, '').trim() : '';

      const type = clean(columns[0]);    // עמודה 0: סוג התפילה
      const shul = clean(columns[1]);    // עמודה 1: בית הכנסת
      const location = clean(columns[2]); // עמודה 2: מקום המניין
      const timeStr = clean(columns[3]);  // עמודה 3: שעה

      if (!timeStr || !timeStr.includes(':')) continue;

      // חישוב הזמן של המניין
      const parts = timeStr.split(':');
      const rMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      
      const diff = rMin - curMin;

      // אנו מחפשים את המניין החיובי (עתידי) הקטן ביותר (הכי קרוב)
      if (diff >= 0 && diff < minDiff) {
        minDiff = diff;

        // בניית המשפט להקראה
        // בודק אם יש "סוג תפילה", אם אין אומר רק "תפילה"
        let tts = `תפילת ${type || ''} `; 
        
        // שם בית הכנסת
        if (shul && shul !== '-') {
            tts += `ב${shul} `;
        }

        // מקום מדויק (אם קיים ושונה ממקף)
        if (location && location !== '-') {
            tts += `ב${location} `;
        }

        tts += `בשעה ${timeStr}`;
        bestText = tts;
      }
    }

    console.log(`Best match found: ${bestText}`);

    // 4. שליחה לימות המשיח
    const ymUrl = `https://www.call2all.co.il/ym/api/UploadTextFile`;
    
    await axios.get(ymUrl, {
      params: {
        token: YM_TOKEN,
        what: `ivr2:54/2/${phone}.tts`, // כותב לקובץ שקשור למספר הטלפון
        contents: bestText
      }
    });

    // מחזיר תשובה לימות שהכל תקין
    res.send('id_list_message=t-ok');

  } catch (error) {
    console.error('Error in /minyan:', error.message);
    // במקרה של שגיאה, המערכת תגיד שגיאה
    res.send('id_list_message=t-error');
  }
});


// =================================================================
// נתיב 2: Gemini AI (המערכת הקודמת שלך)
// הקישור: YourURL/gemini (לדוגמה)
// =================================================================

// כאן אתה יכול להוסיף את הקוד של ג'מיני אם יש לך אותו
// לדוגמה:
app.get('/gemini', async (req, res) => {
    // הקוד של ה-AI שלך יבוא כאן
    res.send('Gemini route is active');
});

app.get('/', (req, res) => {
  res.send('Server is running! Use /minyan for minyanim.');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
