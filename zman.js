require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

// פונקציה לניקוי טקסט (חשוב מאוד לימות המשיח)
function cleanForTTS(str) {
    if (!str) return '';
    return str.replace(/[.,\-"\'&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // ==================================================================
  // 1. לוגים - נראה בדיוק מה ימות המשיח שולחים לנו
  // ==================================================================
  console.log("--------------------------------------------------");
  console.log(">>> פנייה חדשה נכנסה!");
  console.log("Query Parameters:", JSON.stringify(req.query, null, 2)); 
  
  // שליפת המשתנים. שימ לב: minyan_index יגיע רק אם שלחנו אותו בפעם הקודמת
  const menuChoice = req.query.menu_choice; 
  let minyanIndex = req.query.minyan_index;

  console.log(`User Logic: menu_choice (מקש)='${menuChoice}', minyan_index (מיקום)='${minyanIndex}'`);

  try {
    // 2. משיכת הנתונים
    const response = await axios.get(CSV_URL);
    const csvData = response.data;
    const rows = csvData.split(/\r?\n/);
    let minyanim = [];

    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row) continue;
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (columns.length < 4) continue;
      const clean = (str) => str ? str.replace(/"/g, '').trim() : '';
      const timeStr = clean(columns[3]);
      if (!timeStr || !timeStr.includes(':')) continue;

      const parts = timeStr.split(':');
      minyanim.push({
        type: clean(columns[0]),
        shul: clean(columns[1]),
        time: timeStr,
        minutes: parseInt(parts[0]) * 60 + parseInt(parts[1])
      });
    }

    minyanim.sort((a, b) => a.minutes - b.minutes);

    // 3. לוגיקת המיקום (בדיוק כמו בקוד שעובד לך)
    let index;
    let prefix = "";

    // אם אין minyan_index, זה אומר שזו כניסה ראשונה
    if (!minyanIndex || minyanIndex === 'undefined') {
        console.log("--- כניסה ראשונה: מחשב לפי שעה נוכחית ---");
        const now = new Date();
        const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
        const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
        
        index = minyanim.findIndex(m => m.minutes >= curMin);
        if (index === -1) { 
            index = 0; 
            prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר "; 
        }
    } else {
        // אם יש minyan_index, אנחנו ממשיכים משם
        index = parseInt(minyanIndex);
        console.log(`--- המשך גלישה: מתחיל מאינדקס ${index} ---`);

        if (menuChoice === '1') { // הבא
            if (index < minyanim.length - 1) {
                index++;
            } else {
                prefix = "זהו המניין האחרון ";
            }
        } else if (menuChoice === '2') { // קודם
            if (index > 0) {
                index--;
            } else {
                prefix = "זהו המניין הראשון ";
            }
        } else if (menuChoice === '3') { // הכל
            let all = minyanim.map(m => `${m.type} ב${m.shul} בשעה ${m.time}`).join(' ');
            // כאן אנחנו מחזירים את המשתמש לאותו מקום בדיוק
            return res.send(`id_list_message=t-${cleanForTTS("כל המניינים הם " + all)}&go_to_folder=./`);
        } else if (menuChoice === '4') { // יציאה
            return res.send(`id_list_message=t-להתראות&hangup=yes`);
        }
    }

    console.log(`Calculated New Index: ${index}`);

    // 4. בניית התשובה
    const m = minyanim[index];
    const details = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע");

    // =================================================================
    // זה החלק הקריטי שעובד כמו בקוד ששלחת:
    // אנחנו משרשרים את &minyan_index=${index} בסוף ה-read.
    // ימות המשיח יחזירו את זה בפנייה הבאה.
    // =================================================================
    const responseString = `read=t-${details} ${menu}=menu_choice,number,1,1,7,no,no,no&minyan_index=${index}`;
    
    console.log(">>> שולח לימות המשיח:", responseString);
    console.log("--------------------------------------------------");
    
    res.send(responseString);

  } catch (error) {
    console.error("Critical Error:", error);
    res.send(`id_list_message=t-חלה שגיאה במערכת&go_to_folder=/hangup`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
