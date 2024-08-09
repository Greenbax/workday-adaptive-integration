"use strict";

import { ai } from "/Script/Source/Integration2/CustomCloudScripts/CustomCloudScriptApi.js";

var SOURCE_COLUMNS = ["Account Code", "Level Name", "Period", "Value"];
var API_KEY = "...";

var API_URL = "https://api.ziphq.com";

var body = "";
var headers = {
  "Content-Type": "application/json",
  "Zip-Api-Key": API_KEY,
};

// Manually invoke this method via 'Test connection'
function testConnection(context) {
  ai.log.logInfo("context", JSON.stringify(context));
  var response = null;
  try {
    response = ai.https.request(API_URL, "GET", body, headers);
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

function getZipDepartment(departmentName) {
  ai.log.logInfo("Searching Zip department", departmentName);

  var url =
    API_URL +
    "/departments?hide_in_zip=false&is_active=true&name='" +
    departmentName +
    "'";

  var response = null;
  try {
    response = ai.https.request(url, "GET", "", headers);
  } catch (error) {
    ai.log.logError("Zip department API fetch failure", "" + error);
    return null;
  }

  var responseBody = response.getBody();

  if (response.getHttpCode() == "200") {
    var parsedResponse = JSON.parse(responseBody);

    if (!parsedResponse.list) {
      ai.log.logInfo("Zip department fetch failure", responseBody);
      return null;
    }

    for (let i = 0; i < parsedResponse.list.length; i++) {
      if (parsedResponse.list[i].name == departmentName) {
        ai.log.logInfo(
          "Zip department fetch success",
          JSON.stringify(parsedResponse.list[i])
        );
        return parsedResponse.list[i];
      }
    }
  }

  ai.log.logInfo("No Zip department name match", responseBody);

  return null;
}

function getZipAccount(accountCode) {
  ai.log.logInfo("Searching Zip account code", accountCode);

  var url = API_URL + "/gl_codes?active=true&name=" + accountCode;

  var response = null;
  try {
    response = ai.https.request(url, "GET", "", headers);
  } catch (error) {
    ai.log.logError("Zip account API fetch failure", "" + error);
    return null;
  }

  var responseBody = response.getBody();

  if (response.getHttpCode() == "200") {
    var parsedResponse = JSON.parse(responseBody);

    if (!parsedResponse.list) {
      ai.log.logInfo("Zip account fetch failure", responseBody);
      return null;
    }

    for (let i = 0; i < parsedResponse.list.length; i++) {
      if (parsedResponse.list[i].account_number == accountCode) {
        ai.log.logInfo(
          "Zip account fetch success",
          JSON.stringify(parsedResponse.list[i])
        );
        return parsedResponse.list[i];
      }
    }
  }

  ai.log.logInfo("No Zip account code match", responseBody);

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

function putZipBudget(departmentId, accountId, period, value) {
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
    ai.log.logError("Zip budget API PUT failure", "" + error);
    return false;
  }

  var responseBody = response.getBody();

  if (response.getHttpCode() == "200") {
    ai.log.logInfo("Zip budget PUT success", responseBody);
    return true;
  }

  ai.log.logInfo("Zip budget PUT failure", responseBody);

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

    // Get department from Zip
    var zipDepartment = getZipDepartment(departmentName);

    if (!zipDepartment) {
      continue;
    }

    // Get account from Zip
    var zipAccount = getZipAccount(accountCode);

    if (!zipAccount) {
      continue;
    }

    ai.log.logInfo(
      "Zip budget PUT",
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
        value
    );

    putZipBudget(zipDepartment.id, zipAccount.id, period, value);
  }
}
