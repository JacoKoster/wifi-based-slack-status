"use strict";

const os = require('os');
const axios = require("axios");
const execSync = require("child_process").execSync;
const querystring = require("querystring");
const config = require("./config");
const platform = os.platform();
const cl = require('corelocation');

const googleMapsClient = require('@google/maps').createClient({
    key: config.mapsKey
});

if (!config.slackToken) {
    console.error("Missing Slack token. Set it in config.js");
    process.exit(1);
}

if(platform !== 'darwin' && platform !== 'win32' && platform !== 'linux' ) {
    console.error('Unsupported platform %s', platform);
    process.exit(1);
}

function getLinuxWiFiName() {
    return execSync("iwgetid -r") // Linux only
            .toString()
            .split("\n")
            .filter(line => line.match(/.+/))
            .find(ssid => true); // find first
}

function getMacWiFiName() {
    return execSync("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I") // macos only
            .toString()
            .split("\n")
            .filter(line => line.includes(" SSID: "))
            .map(line => line.match(/: (.*)/)[1])
            .find(ssid => true); // find first
}

function getWinWiFiName() {
    return execSync("netsh wlan show interfaces") // Windows only
            .toString()
            .split("\n")
            .filter(line => line.includes(" SSID "))
            .map(line => line.match(/: (.*)/)[1])
            .find(ssid => true); // find first
}

let lastStatus = "";

function setSlackStatus(status) {
    let token = config.slackToken;

    if ( status === lastStatus ) {
        //console.log('Skip setting status, is the same as last time');
        return;
    }

    return axios.post("https://slack.com/api/users.profile.set",
        querystring.stringify({
            token: token,
            profile: JSON.stringify(status)
        }), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }).then(function(response) {
            if(response.ok === false) {
                console.error("Slack status API error response: %s", response);
                return;
            }

            lastStatus = status;

            //console.log("Set Slack status API response: %j", response.data);
        })
        .catch(function(error) {
            console.error("Set Slack status error: %s", error);
        });
}

function getStatus(callback) {

    let wiFiName;

    // Get appropriate function for platform
    switch (platform) {
        case 'darwin':
            //let's use the corelocation thingie and see if we can make it a bit more finegrained
            getLocation(callback);

            //wiFiName = getMacWiFiName();
            break;
        case 'win32':
            wiFiName = getWinWiFiName();

            callback(config.statusByWiFiName[wiFiName]);
            break;
        case 'linux':
            wiFiName = getLinuxWiFiName();

            callback(config.statusByWiFiName[wiFiName]);
            break;
        default:
            callback(config.statusHidden);
            break;
    }
}

function getLocation(callback) {

    let longLat = cl.getLocation();

    googleMapsClient.reverseGeocode({
        latlng: [longLat[1],longLat[0]],
        result_type: ['locality'],
    }, function(err, response) {
        if (!err) {
            let location = response.json.results[0].address_components[0].long_name;

            callback(config.statusByLocation[location])
        } else {
            console.log(err);
        }
    });
}

function updater() {
    getStatus(setSlackStatus);

}

setInterval(updater, config.updateInterval);

updater();