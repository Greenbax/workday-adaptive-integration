"use strict";

import { ai } from "/Script/Source/Integration2/CustomCloudScripts/CustomCloudScriptApi.js";

// Update the following variables with your own values /////////
var SOURCE_COLUMNS = ["Account Code", "Level Name", "Period", "Value"];
var API_KEY = "...";
////////////////////////////////////////////////////////////////

var API_URL = "https://api.ziphq.com";

var headers = {
  "Content-Type": "application/json",
  "Zip-Api-Key": API_KEY,
};

// Manually invoke this method via 'Test connection'
function testConnection(context) {
  ai.log.logInfo("context", JSON.stringify(context));
  var response = null;
  try {
    response = ai.https.request(API_URL, "GET", "", headers);
  } catch (error) {
    ai.log.logError("Test Connection HTTPS Request failed", "" + error);
    return false;
  }

  var httpCode = response.getHttpCode();
  var responseBody = response.getBody();

  ai.log.logInfo("HTTP Code", httpCode);

  if (httpCode == "200") {
    ai.log.logInfo("Success", responseBody);
    return true;
  }

  ai.log.logError("Failed", responseBody);

  return false;
}

function fetchAllPages(url, params = {}) {
  var results = [];
  var pageToken = "";

  do {
    params.page_token = pageToken;
    var queryString = Object.keys(params)
      .map((key) => key + "=" + encodeURIComponent(params[key]))
      .join("&");
    var paginatedUrl = url + "?" + queryString;

    var response = null;
    try {
      response = ai.https.request(paginatedUrl, "GET", "", headers);
    } catch (error) {
      ai.log.logError("API fetch failure", "" + error);
      return null;
    }

    var responseBody = response.getBody();
    if (response.getHttpCode() == "200") {
      var parsedResponse = JSON.parse(responseBody);
      results = results.concat(parsedResponse.list);
      pageToken = parsedResponse.next_page_token;
    } else {
      ai.log.logError("API fetch failure", responseBody);
      return null;
    }
  } while (pageToken);

  return results;
}

function getAllDepartments() {
  ai.log.logInfo("Fetching all departments");

  var url = API_URL + "/departments";
  var params = {
    hide_in_zip: false,
    is_active: true,
    page_size: 100,
  };

  return fetchAllPages(url, params);
}

function getAllAccounts() {
  ai.log.logInfo("Fetching all GL accounts");

  var url = API_URL + "/gl_codes";
  var params = {
    active: true,
    page_size: 100,
  };

  return fetchAllPages(url, params);
}

function findByName(list, name) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].name === name) {
      return list[i];
    }
  }
  return null;
}

function findByAccountCode(list, accountCode) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].account_number === accountCode) {
      return list[i];
    }
  }
  return null;
}

function parsePeriod(period) {
  var parts = period.split("/");
  var month = parts[0];
  var year = parts[1];
  var newDateStr = month + "/01/" + year;
  return {
    month: month,
    year: year,
    formattedDate: newDateStr,
  };
}

function putZipBudget(departmentId, accountId, period, value, logInfo) {
  var url = API_URL + "/budgets";

  var parsedPeriod = parsePeriod(period);

  var payload = {
    data: {
      department_id: departmentId,
      gl_account_id: accountId,
      start_date: parsedPeriod.formattedDate,
      amount: value + "", // Make it a string
    },
  };

  var body = JSON.stringify(payload);

  var response = null;
  try {
    response = ai.https.request(url, "PUT", body, headers);
  } catch (error) {
    ai.log.logError("Zip budget API PUT failure", logInfo + " | " + error);
    return false;
  }

  var responseBody = response.getBody();

  if (response.getHttpCode() == "200") {
    ai.log.logInfo("Zip budget PUT success", logInfo + " | " + responseBody);
    return true;
  }

  ai.log.logError("Zip budget PUT failure", logInfo + " | " + responseBody);

  return false;
}

// Function for aggregating data, because Adaptive does not support aggregating the months into year
function aggregateByYear(reader) {
  var aggregatedData = {};

  var row = null;
  while ((row = reader.readRow()) !== null) {
    var departmentName = row[SOURCE_COLUMNS.indexOf("Level Name")];
    var accountCode = row[SOURCE_COLUMNS.indexOf("Account Code")];
    var period = row[SOURCE_COLUMNS.indexOf("Period")];
    var value = parseFloat(row[SOURCE_COLUMNS.indexOf("Value")]);

    var parsedPeriod = parsePeriod(period);
    var fiscalYear = parsedPeriod.year;

    var key = departmentName + " | " + accountCode + " | " + fiscalYear;

    if (!aggregatedData[key]) {
      aggregatedData[key] = {
        departmentName: departmentName,
        accountCode: accountCode,
        fiscalYear: fiscalYear,
        value: 0,
      };
    }

    aggregatedData[key].value += value;
  }

  return aggregatedData;
}

// Manually invoke this method via 'Run manually'
function exportData(context) {
  ai.log.logInfo("STARTING EXPORT");

  // Fetch all departments and accounts upfront
  var allDepartments = getAllDepartments();
  var allAccounts = getAllAccounts();

  if (!allDepartments || !allAccounts) {
    ai.log.logError("Failed to fetch all departments or accounts");
    return;
  }

  var reader = context.createTableReader(SOURCE_COLUMNS);
  var aggregatedData = aggregateByYear(reader);

  ai.log.logInfo("Aggregated data:", JSON.stringify(aggregatedData));
  ai.log.logInfo("Number of budgets:", Object.keys(aggregatedData).length);

  for (var key in aggregatedData) {
    var data = aggregatedData[key];
    var departmentName = data.departmentName;
    var accountCode = data.accountCode;
    var fiscalYear = data.fiscalYear;
    var value = data.value;

    var period = "01/" + fiscalYear;

    // Find department and account from pre-fetched data
    var zipDepartment = findByName(allDepartments, departmentName);
    var zipAccount = findByAccountCode(allAccounts, accountCode);

    if (!zipDepartment || !zipAccount) {
      ai.log.logInfo(
        "No match found for department or account",
        "Department: " + departmentName + ", Account: " + accountCode
      );
      continue;
    }

    var logInfo =
      "Department Name: " +
      departmentName +
      ", Department ID: " +
      zipDepartment.id +
      ", Account Code: " +
      accountCode +
      ", Account ID: " +
      zipAccount.id +
      ", Period: " +
      period +
      ", Value: " +
      value;

    putZipBudget(zipDepartment.id, zipAccount.id, period, value, logInfo);
  }
}
