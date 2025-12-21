require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

// פונקציית ניקוי אגרסיבית למניעת ניתוקים
function cleanForTTS(str) {
    if (!str) return '';
    // משאיר רק אותיות בעברית/אנגלית, מספרים ורווחים. כל השאר נמחק.
    return str.replace(/[^a-zA-Z0-9\u0590-\u05FF\s:.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // ================= L O G S =================
  console.log("\n====== בקשה חדשה נכנסה ======");
  console.log("נתונים שהתקבלו מימות המשיח:", JSON.stringify(req.query, null, 2));
  // ===========================================

  const menuChoice = req.query.menu_choice;
  const minyanIndex = req.query.minyan_index;

  try {
    // 1. בדיקת תקינות CSV
    console.log("מוריד קובץ CSV...");
    const response = await axios.get(CSV_URL);
    if (!response.data) throw new Error("קובץ CSV ריק");
    
    const csvData = response.data;
    const rows = csvData.split(/\r?\n/);
    let minyanim = [];

    // 2. עיבוד הנתונים
    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row) continue;
      // פיצול חכם של שורות ה-CSV
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      
      if (columns.length < 4) continue; // דילוג על שורות לא תקינות

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
    console.log(`סה"כ מניינים תקינים שנמצאו: ${minyanim.length}`);

    if (minyanim.length === 0) {
        console.log("לא נמצאו מניינים - שולח הודעה למשתמש");
        return res.send("id_list_message=t-לא נמצאו מניינים בקובץ הנתונים");
    }

    // 3. לוגיקת הניווט (Next/Prev)
    let index = (minyanIndex !== undefined && minyanIndex !== "undefined" && minyanIndex !== "") ? parseInt(minyanIndex) : null;
    let prefix = "";

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    if (index === null || isNaN(index)) {
      console.log("חישוב מניין קרוב לשעה הנוכחית...");
      index = minyanim.findIndex(m => m.minutes >= curMin);
      if (index === -1) { 
          index = 0; 
          prefix = "לא נמצאו מניינים נוספים להיום. מנייני מחר: "; 
      }
    } else {
      console.log(`משתמש ביקש פעולה: ${menuChoice} כשהוא במניין מספר: ${index}`);
      if (menuChoice === '1') { // הבא
        if (index < minyanim.length - 1) index++;
        else prefix = "זהו המניין האחרון. ";
      } else if (menuChoice === '2') { // קודם
        if (index > 0) index--;
        else prefix = "זהו המניין הראשון. ";
      } else if (menuChoice === '3') { // הכל
        let all = minyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join('. ');
        const cleanAll = cleanForTTS("כל המניינים הם " + all);
        const resp = `id_list_message=t-${cleanAll}&go_to_folder=./`;
        console.log("שולח את כל המניינים");
        return res.send(resp);
      } else if (menuChoice === '4') {
        console.log("משתמש ביקש יציאה");
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
      }
    }

    const m = minyanim[index];
    const details = `${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}. `;
    const menu = "לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל המניינים שלוש. ליציאה ארבע.";
    
    const finalTTS = cleanForTTS(details + menu);

    // 4. בניית התשובה
    // אנו משתמשים ב-& רגיל, כאשר api_set_var בא בסוף כדי שלא יפריע ל-read
    const responseString = `read=t-${finalTTS}=menu_choice,number,1,1,7,no,no,no&api_set_var=minyan_index=${index}`;
    
    console.log("====== תשובה נשלחת ======");
    console.log(responseString);
    console.log("=========================");
    
    res.send(responseString);

  } catch (error) {
    console.error("CRITICAL ERROR:", error.message);
    // במקרה של קריסה - המערכת תקריא את השגיאה במקום להתנתק
    res.send(`id_list_message=t-שגיאה קריטית בשרת: ${cleanForTTS(error.message)}`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
