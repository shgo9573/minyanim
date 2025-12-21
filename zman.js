require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

function cleanForTTS(str) {
    if (!str) return '';
    return str.replace(/[.,\-"\']/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');

  // ==========================================
  // לוגים לבדיקת הנתונים הנכנסים
  // ==========================================
  console.log("--- פנייה חדשה מהטלפון ---");
  console.log("כל הפרמטרים שהתקבלו:", JSON.stringify(req.query, null, 2));
  
  const menuChoice = req.query.menu_choice;
  const minyanIndex = req.query.minyan_index;

  console.log(`ניתוח: מקש שנלחץ = ${menuChoice}, מיקום נוכחי = ${minyanIndex}`);

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

    // לוגיקה
    let index = (minyanIndex !== undefined && minyanIndex !== "") ? parseInt(minyanIndex) : null;
    let prefix = "";

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    if (index === null || isNaN(index)) {
      console.log("כניסה ראשונה - מחפש מניין קרוב...");
      index = minyanim.findIndex(m => m.minutes >= curMin);
      if (index === -1) { index = 0; prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר "; }
    } else {
      if (menuChoice === '1') {
        if (index < minyanim.length - 1) index++;
        else prefix = "זהו המניין האחרון ";
      } else if (menuChoice === '2') {
        if (index > 0) index--;
        else prefix = "זהו המניין הראשון ";
      } else if (menuChoice === '3') {
        let all = minyanim.map(m => `${m.type} ב${m.shul} בשעה ${m.time}`).join(' ');
        return res.send(`id_list_message=t-${cleanForTTS("כל המניינים הם " + all)}&go_to_folder=./`);
      } else if (menuChoice === '4') {
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
      }
    }

    const m = minyanim[index];
    console.log(`נבחר מניין להשמעה: אינדקס ${index}, זמן ${m.time}`);

    const details = `${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time} `;
    const menu = "לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע";
    const finalTTS = cleanForTTS(details + menu);

    // שליחת התגובה
    const responseString = `api_set_var=minyan_index=${index}&read=t-${finalTTS}=menu_choice,number,1,1,7,no,no,no`;
    
    console.log("תגובה נשלחת לטלפון:", responseString);
    res.send(responseString);

  } catch (error) {
    console.error("שגיאה בשרת:", error.message);
    res.send(`id_list_message=t-חלה שגיאה בשרת`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
