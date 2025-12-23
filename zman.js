require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

// פונקציה לניקוי טקסט קפדני
function cleanForTTS(str) {
    if (!str) return '';
    // מסיר סימני פיסוק, תווי &%=? שיכולים לשבור URL, ומונע כפל רווחים
    return str.replace(/[.,\-"\'&%=?]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  // קביעת ה-Header מיד, בצורה מפורשת, לפני כל דבר אחר
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // ==========================================
  // לוגים מפורטים לבדיקה
  // ==========================================
  console.log("--- פנייה חדשה (מנסה פתרון סופי) ---");
  console.log("כל הפרמטרים שהתקבלו:", JSON.stringify(req.query, null, 2));
  
  // נחלץ רק את הפרמטרים שאנחנו מצפים להם, כדי למנוע רעשים
  const menuChoice = req.query.menu_choice;
  let minyanIndex = req.query.minyan_index; // ישמש כאינדקס נוכחי

  try {
    const response = await axios.get(CSV_URL);
    const csvData = response.data;
    const rows = csvData.split(/\r?\n/);
    let minyanim = [];

    // [אוסף ומיון מניינים - ללא שינוי]

    // לוגיקת האינדקס
    let index = (minyanIndex !== undefined && minyanIndex !== "") ? parseInt(minyanIndex) : null;
    let prefix = "";

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    if (index === null || isNaN(index)) { // כניסה ראשונה
      index = minyanim.findIndex(m => m.minutes >= curMin);
      if (index === -1) { index = 0; prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר "; }
    } else { // טיפול בלחיצות
      if (menuChoice === '1') { // הבא
        if (index < minyanim.length - 1) index++;
        else prefix = "זהו המניין האחרון. ";
      } else if (menuChoice === '2') { // קודם
        if (index > 0) index--;
        else prefix = "זהו המניין הראשון. ";
      } else if (menuChoice === '3') { // הכל
        let all = minyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
        return res.send(`read=t-${cleanForTTS("כל המניינים הם " + all)}. לחזרה הקש סולמית=menu_choice,number,1,1,7,no,no,no&minyan_index=${index}`);
      } else if (menuChoice === '4') { // יציאה
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
      }
    }

    const m = minyanim[index];
    const details = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס, למניין הבא אחת, לקודם שתיים, לכל המניינים שלוש, ליציאה ארבע");
    
    // =================================================================
    // התשובה הסופית: פקודת read אחת, והאינדקס מוצמד בסוף
    // =================================================================
    const responseString = `read=t-${details} ${menu}=menu_choice,number,1,1,7,no,no,no&minyan_index=${index}`;
    
    console.log("תגובה נשלחת:", responseString);
    res.send(responseString);

  } catch (error) {
    console.error("שגיאה קריטית:", error);
    res.send(`id_list_message=t-חלה שגיאה בלתי צפויה במערכת, אנא נסה שנית מאוחר יותר`);
  }
});

app.listen(port, () => console.log(`שרת רץ על פורט ${port}`));
