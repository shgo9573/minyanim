require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

// ניקוי טקסט קפדני
function cleanForTTS(str) {
    if (!str) return '';
    // מסירים את כל התווים שיכולים לגרום בעיות ב-TTS או ב-URL
    return str.replace(/[.,\-"\'&%=?]/g, ' ').replace(/\s+/g, ' ').trim(); 
}

app.get('/minyan', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  console.log("--- פנייה חדשה (ניסיון עם ,,1,1) ---");
  const { menu_choice, minyan_index } = req.query;
  console.log(`נתונים שהתקבלו: menu_choice=${menu_choice}, minyan_index=${minyan_index}`);

  try {
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

    if (minyanim.length === 0) {
        return res.send(`id_list_message=t-${cleanForTTS("לא נמצאו מניינים בקובץ הנתונים")}`);
    }

    // לוגיקת המיקום
    let index = (minyan_index !== undefined && minyan_index !== "") ? parseInt(minyan_index) : null;
    let prefix = "";

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    if (index === null || isNaN(index)) {
      index = minyanim.findIndex(m => m.minutes >= curMin);
      if (index === -1) { index = 0; prefix = "לא נמצאו מניינים נוספים להיום. מנייני מחר: "; }
    } else {
      if (menu_choice === '1') {
        if (index < minyanim.length - 1) index++;
        else prefix = "זהו המניין האחרון. ";
      } else if (menu_choice === '2') {
        if (index > 0) index--;
        else prefix = "זהו המניין הראשון. ";
      } else if (menu_choice === '3') {
        let all = minyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
        return res.send(`id_list_message=t-${cleanForTTS("כל המניינים הם " + all)}&go_to_folder=/`);
      } else if (menu_choice === '4') {
        return res.send(`id_list_message=t-${cleanForTTS("להתראות")}&hangup=yes`);
      }
    }

    const m = minyanim[index];
    const details = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס, למניין הבא אחת, לקודם שתיים, לכל המניינים שלוש, ליציאה ארבע");
    
    // =================================================================
    // התיקון הקריטי: שימוש בפורמט ,,1,1 (שני פסיקים רצופים)
    // =================================================================
    const responseString = `read=t-${details} ${menu}=menu_choice,,1,1&minyan_index=${index}`;
    
    console.log("תגובה נשלחת (פורמט ,,1,1):", responseString);
    res.send(responseString);

  } catch (error) {
    console.error("שגיאה קריטית בשרת:", error.message);
    res.send(`id_list_message=t-${cleanForTTS("חלה שגיאה בלתי צפויה בשרת")}&go_to_folder=/`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
