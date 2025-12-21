require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/_%D7%96%D7%9E%D7%A0%D7%99%20%D7%94%D7%AA%D7%A4%D7%99%D7%9C%D7%95%D7%AA%20-%20%D7%92%D7%99%D7%9C%D7%99%D7%95%D7%9F1.csv'; 

app.get('/minyan', async (req, res) => {
  try {
    // שלב 1: משיכת הנתונים ועיבוד (כמו קודם)
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
      const totalMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

      minyanim.push({
        type: clean(columns[0]),
        shul: clean(columns[1]),
        location: clean(columns[2]),
        time: timeStr,
        minutes: totalMinutes
      });
    }
    // מיון לפי זמן
    minyanim.sort((a, b) => a.minutes - b.minutes);

    if (minyanim.length === 0) return res.send("id_list_message=t-לא נמצאו מניינים");

    // =================================================================
    // שלב 2: לוגיקת "המפל" (Waterfall Logic)
    // =================================================================

    // בדיקה: האם יש לנו כבר אינדקס? (האם זו פנייה חוזרת?)
    let currentIndex;
    
    if (req.query.minyan_index) {
        // אם יש אינדקס ב-URL, נשתמש בו
        currentIndex = parseInt(req.query.minyan_index);
    } else {
        // אם אין (כניסה ראשונה), נחשב אותו לפי השעה
        const now = new Date();
        const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
        const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
        currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
        if (currentIndex === -1) currentIndex = 0;
    }

    // בדיקה: האם המשתמש ביצע פעולה? (menu_choice)
    const action = req.query.menu_choice;

    if (action === '1') { // מניין הבא
        if (currentIndex < minyanim.length - 1) {
            currentIndex++;
        }
    } else if (action === '2') { // מניין קודם
        if (currentIndex > 0) {
            currentIndex--;
        }
    } else if (action === '3') { // השמעת כל המניינים
        let allText = minyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
        // כאן אנחנו משמיעים הכל, ואז מחזירים את המשתמש לאותו מקום (אותו index)
        return res.send(`read=t-רשימת כל המניינים: ${allText}. לחזרה למניין הנוכחי הקש משהו=menu_choice,number,1,1,1&minyan_index=${currentIndex}`);
    } else if (action === '4') { // יציאה
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
    }

    // =================================================================
    // שלב 3: בניית התשובה לפעם הבאה
    // =================================================================

    const m = minyanim[currentIndex];
    const details = `תפילת ${m.type || ''} ב${m.shul || ''} בשעה ${m.time}. `;
    
    // הנחיה קולית דינמית (כדי לא להגיד "למניין הבא" אם אנחנו בסוף)
    let menuText = "לשמיעה חוזרת הקש 0. ";
    if (currentIndex < minyanim.length - 1) menuText += "למניין הבא 1. ";
    if (currentIndex > 0) menuText += "למניין הקודם 2. ";
    menuText += "לכל המניינים 3. ליציאה 4.";

    // הסוד הגדול: אנחנו שולחים את הפקודה read, ומצמידים לה את ה-minyan_index המעודכן!
    // בפעם הבאה שהמשתמש יקיש משהו, ימות המשיח ישלח לנו חזרה: menu_choice=X וגם minyan_index=Y
    
    res.set('Content-Type', 'text/plain; charset=utf-8');
    
    // שימוש בתחביר המדויק מהקוד ששלחת:
    // read=t-TEXT=VAR_NAME,TYPE,MAX,MIN... & STATE_VAR=VALUE
    res.send(`read=t-${details} ${menuText}=menu_choice,number,1,1,7,Digits&minyan_index=${currentIndex}`);

  } catch (error) {
    console.error(error);
    res.send('id_list_message=t-שגיאה במערכת');
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
