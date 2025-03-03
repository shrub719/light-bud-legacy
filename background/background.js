// ========== CLASSES ==========
// class exclusives: notifyState()

class Health {
    constructor(value, max) {
        this.value = value;
        this.max = max;
        this.state = this.calculateState();
    }

    update(value) {
        console.log(this.value);
        console.log(value);
        let oldState = this.state;
        this.value += value;
        if (this.value > this.max) {
            this.value = this.max;
        } else if (this.value <= 0) {
            this.value = 0;
            creature.level.exp = 0;
        }

        this.state = this.calculateState();
        if (oldState && this.state < oldState) {
            notifyState();
        }

        saveCreature();
    }

    calculateState() {
        let health = this.value;
        if (health >= 50) {
            return 3;
        } else if (health >= 20) {
            return 2;
        } else if (health > 0) {
            return 1;
        } else {
            return 0;
        }
    }
}

class Level {
    constructor(level, exp) {
        this.level = level;
        this.exp = exp;
        this.nextLevel = this.calculateExp();
    }

    calculateExp() {
        return (100 + 10*(this.level-1));
    }

    update(value) {
        this.exp += value;
        if (this.exp >= this.nextLevel) {
            this.level++;
            this.exp = 0;
            this.nextLevel = this.calculateExp();
        }
        saveCreature();
    }
}

class Creature {
    constructor(name, health, level, exp, isAsleep, sleepTimer) {
        this.name = name;
        this.health = new Health(health, 100);
        this.level = new Level(level, exp);
        this.isAsleep = false;
        this.sleepTimer = 0;
    }

    toJSON() {
        return {
            name: this.name,
            health: this.health.value,
            level: this.level.level,
            exp: this.level.exp,
            isAsleep: this.isAsleep,
            sleepTimer: this.sleepTimer
        };
    }

    updateFromJSON(json) {
        this.name = json.name;
        this.health.value = json.health;
        this.level.level = json.level;
        this.level.exp = json.exp;
        this.isAsleep = json.isAsleep;
    }

    static createFromJSON(json) {
        return new Creature(
            json.name,
            json.health,
            json.level,
            json.exp,
            json.isAsleep,
            json.sleepTimer
        );
    }
}


// ========== CREATURE MANAGEMENT ==========

let creature = {};

function createCreature() {
    chrome.storage.local.get("creature", (data) => {
        if (data.creature) {
            console.log(data.creature);
            creature = Creature.createFromJSON(data.creature);
        } else {
            creature = new Creature("Greg", 100, 1, 0);
            console.log("bg: no creature data")
        }
    });
}

function loadCreature() {
    chrome.storage.local.get("creature", (data) => {
        if (data.creature) {
            creature.updateFromJSON(data.creature);
        } else {
            creature = new Creature("Greg", 100, 1, 0);
            console.log("bg: no creature data")
        }
    });
}

function saveCreature() {
    chrome.storage.local.set({creature: creature.toJSON()}, () => {
        console.log("bg: creature saved", creature.toJSON());
        chrome.runtime.sendMessage({type: "creatureUpdated"});
    });
}


// ========== SETTINGS ==========

let blacklist = [
    "tiktok.com",
    "x.com",
    "youtube.com"
];
let on = true;
let focusedTick = 1;
let normalTick = 0.25;
let distractedTick = 0.5;
let timerLength = 25;
let creatureName = "Greg";

function loadSettings() {
    chrome.storage.local.get("settings", (data) => {
        if (data.settings) {
            let json = data.settings;
            blacklist = json.blacklist;
            on = json.on;
            timerLength = json.timerLength;
            creatureName = creatureName;
            creature.name = creatureName;
            saveCreature();
        } else {
            console.log("bg: no settings data")
        }
    });
}


// ========== MESSAGES ==========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "creatureUpdated":
            loadCreature();
            break;
        case "settingsUpdated":
            loadSettings();
            break;
        case "focusStart":
            loadCreature();
            expToGive = timerLength * 2;
            creature.sleepTimer = timerLength * 60 + 1;
            wakeCountdown = 5;
            notified = false;
            break;
    }
});


// ========== DISTRACTION ==========

let messages = [
    "Oh no!",
    "Uh oh...",
    "Oops."
];
let distractionTimer;
let isDistracted = false;
let currentTab = null;
let expToGive;
let wakeCountdown = 5;
let notified = false;

// runs every second
// adjust values
function healthTick() {
    if (on && creature.health.value > 0) {
        getActiveTab();
        checkDistraction();
        if (creature.isAsleep) {
            if (creature.sleepTimer <= 0 || isNaN(creature.sleepTimer)) {
                creature.isAsleep = false;
                creature.level.update(expToGive);
                saveCreature();
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "../icons/icon-128.png",
                    title: "Focus session over",
                    message: creature.name + " has woken up!",
                    priority: 1
                  });
            } else if (isDistracted && !notified) {
                wakeCountdown = 5;
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "../icons/icon-128.png",
                    title: "Stay focused!",
                    message: "Your focus timer has paused. You have 5 seconds to get back to work before " + creature.name + " wakes up!",
                    priority: 2
                  });
                  notified = true;
            } else if (isDistracted && notified && wakeCountdown > 0) {
                wakeCountdown -= 1;
            } else if (isDistracted && notified && wakeCountdown <= 0) {
                creature.isAsleep = false;
                creature.sleepTimer = 0;
                creature.health.update(-20);
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "../icons/icon-128.png",
                    title: "Focus broken",
                    message: creature.name + " has woken up.",
                    priority: 2
                  });
            } else {
                notified = false;
                creature.sleepTimer -= 1;
                creature.health.update(focusedTick);
            }
        } else {
            if (isDistracted) {
                creature.health.update(-distractedTick);
            } else {
                creature.health.update(normalTick);  
            }
        }
    }
}

// runs every second (used to on tab change)
function checkDistraction() {
    try {
        let url = new URL(currentTab.url);
        url = url.hostname;
        if (url.slice(0, 4) === "www.") {
            url = url.slice(4);
        }
        isDistracted = blacklist.includes(url);
    } catch (err) {
        console.log("invalid url");
    }
}

function notifyState() {
    let state = creature.health.state;
    let name = creature.name;
    let message;
    switch (state) {
        case 0:
            message = name + " has died."
            break;
        case 1:
            message = name + " is feeling really sick..."
            break;
        case 2:
            message = name + " is a little down right now."
            break;
        default:
            break;
    }

    let title = messages[Math.floor(Math.random() * messages.length)];
    chrome.notifications.create({
        type: "basic",
        iconUrl: "../icons/icon-128.png",
        title: title,
        message: message,
        priority: 1
      });
}

/*
// on tab switch
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        
    });
});

// on url change
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
        
    }
});
*/

// gets current tab
function getActiveTab() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length > 0) {
            currentTab = tabs[0];
        }
    });
}

function initialise() {
    loadSettings();
    createCreature();
    distractionTimer = setInterval(healthTick, 1000);
    chrome.alarms.create({periodInMinutes: 0.1})
}


// ========== LISTENERS ==========

chrome.runtime.onInstalled.addListener(initialise);

chrome.runtime.onStartup.addListener(initialise);

chrome.alarms.onAlarm.addListener(() => {
    console.log("wakie wakie!")
  });
