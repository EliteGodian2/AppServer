import fetchOrig from "node-fetch";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { JSDOM } from "jsdom";
import express from "express";

const app = express();
app.use(express.json());

const login = async (username, password) => {
  const cookieJar = new CookieJar();
  const fetch = fetchCookie(fetchOrig, cookieJar);

  const fetchWithRetry = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  const loginUrl =
    "https://hac.friscoisd.org/HomeAccess/Account/LogOn?ReturnUrl=%2fHomeAccess%2f";
  const loginPage = await fetchWithRetry(loginUrl, {
    redirect: "manual",
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const html = await loginPage.text();
  const dom = new JSDOM(html);
  const tokenInput = dom.window.document.querySelector(
    'input[name="__RequestVerificationToken"]'
  );
  if (!tokenInput) throw new Error("Token not found");
  const token = tokenInput.value;

  const formData = new URLSearchParams();
  formData.append("__RequestVerificationToken", token);
  formData.append("LogOnDetails.UserName", username);
  formData.append("LogOnDetails.Password", password);
  formData.append("Database", "10");
  formData.append("VerificationOption", "UsernamePassword");

  const response = await fetch(loginUrl, {
    method: "POST",
    body: formData,
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      Referer: loginUrl,
    },
  });

  if (response.status === 302) {
    const redirectedUrl = new URL(response.headers.get("location"), loginUrl)
      .href;

    const homePage = await fetch(redirectedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: loginUrl,
      },
    });

    const homeHtml = await homePage.text();
    const homeDom = new JSDOM(homeHtml);

    const userNameElement = homeDom.window.document.evaluate(
      "/html/body/div[1]/div[1]/div/div[1]/ul/li[1]/span",
      homeDom.window.document,
      null,
      homeDom.window.XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;

    const userName = userNameElement
      ? userNameElement.textContent.trim()
      : "Unknown User";

    if (userName) {
      const classworkUrl =
        "https://hac.friscoisd.org/HomeAccess/Classes/Classwork";
      const classworkPage = await fetch(classworkUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: redirectedUrl,
        },
      });

      const classworkHtml = await classworkPage.text();
      const classworkDom = new JSDOM(classworkHtml);

      const iframeElement =
        classworkDom.window.document.querySelector("iframe");
      if (!iframeElement) throw new Error("Iframe not found");
      const iframeUrl = iframeElement.src;

      const baseUrl = "https://hac.friscoisd.org";
      const fullIframeUrl = iframeUrl.startsWith("http")
        ? iframeUrl
        : baseUrl + iframeUrl;

      const iframePage = await fetch(fullIframeUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: classworkUrl,
        },
      });

      const iframeHtml = await iframePage.text();
      const iframeDom = new JSDOM(iframeHtml);

      const assignmentClasses =
        iframeDom.window.document.querySelectorAll(".AssignmentClass");

      const assignmentsData = [];
      assignmentClasses.forEach((classDiv) => {
        const courseNameElement = classDiv.querySelector(".sg-header-heading");
        const courseName = courseNameElement
          ? courseNameElement.textContent.trim()
          : "Course Name Not Found";

        const averageElement = classDiv.querySelector(
          '[id^="plnMain_rptAssigmnetsByCourse_lblHdrAverage_"]'
        );
        const overallAverage = averageElement
          ? averageElement.textContent.trim()
          : "Average Not Found";

        const assignmentTable = classDiv.querySelector(".sg-asp-table");
        const assignmentRows = assignmentTable
          ? assignmentTable.querySelectorAll("tr.sg-asp-table-data-row")
          : [];

        const assignments = [];
        assignmentRows.forEach((row) => {
          const assignmentElement = row.querySelector("td a");
          const assignmentName = assignmentElement
            ? assignmentElement.textContent.trim()
            : "Assignment Name Not Found";

          const gradeElement = row.querySelector("td:nth-child(5)");
          const grade = gradeElement
            ? gradeElement.textContent.trim()
            : "Grade Not Found";

          assignments.push({
            assignmentName,
            grade,
          });
        });

        assignmentsData.push({
          courseName,
          overallAverage,
          assignments,
        });
      });

      return {
        userName,
        assignmentsData,
      };
    }
  } else {
    throw new Error("Login failed");
  }
};

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const data = await login(username, password);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message,
    });
  }
});
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Blank Page</title>
    </head>
    <body>
    </body>
    </html>
  `);
});
const PORT = process.env.PORT || 3000;

app.head("/", (req, res) => {
  res.status(200).end(); // Respond with a 200 status and no body
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
