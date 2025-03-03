// ========== CLASSES ==========
// class exclusives: updateUI(), Animator, stateChange()

class Health {
    constructor(value, max) {
        this.value = value;
        this.max = max;
        this.state = this.calculateState();
    }

    update(value) {
        this.value += value;
        if (this.value > this.max) {
            this.value = this.max;
        } else if (this.value <= 0) {
            this.value = 0;
            creature.level.exp = 0;
        }

        this.state = this.calculateState();

        updateUI();
        stateChange();
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
            this.exp = this.exp - this.nextLevel;
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
        this.isAsleep = isAsleep;
        this.sleepTimer = sleepTimer;
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
        this.sleepTimer = json.sleepTimer;
        updateUI();
        stateChange();
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
            creature = Creature.createFromJSON(data.creature);
        } else {
            creature = new Creature("Greg", 100, 1, 0);
            console.log("pp: no creature data")
        }  
        if (!creature.isAsleep) {
            animator.state = creature.health.state;
            lastState = creature.health.state;
        } else {
            animator.state = "sleep";
            lastState = "sleep";
        }
        nextFrame();
        idle();
        setInterval(nextFrame, 84);
        updateUI();
        if (animator.state == 0) {
            showInfo("death", "Whoops.", creature.name + " has died! All exp progress towards the next level has been lost.");
        }
    });
}

function loadCreature() {
    chrome.storage.local.get("creature", (data) => {
        if (data.creature) {
            creature.updateFromJSON(data.creature);
        } else {
            creature = new Creature("Greg", 100, 1, 0);
            console.log("pp: no creature data")
        }
        creature.health.state = creature.health.calculateState();
        updateUI();
        stateChange();
    });
}

function saveCreature() {
    chrome.storage.local.set({creature: creature.toJSON()}, () => {
        console.log("pp: creature saved", creature.toJSON());
        chrome.runtime.sendMessage({type: "creatureUpdated"});
    });
}


// ========== ANIMATION ==========
// length of 4 means has frames 1-4
// animation 0 is still frame

class Animator {
    constructor() {
        this.state = undefined;
        this.animation = 0;
        this.frame = 0;
    }

    getSrc() {
        return `frames/${this.state}-${this.animation}-${this.frame+1}.png`;
    }

    increment() {
        this.frame++;
    }

    setAnimation (animation) {
        this.animation = animation;
        this.frame = 0;
    }
}

let lastState;
const animator = new Animator();
const creatureImg = document.getElementById("creature-img");

const animationLength = {
    3: {
        1: 5,
        2: 9,
        pet: 12,
        to2: 5,
        tosleep: 10
    },
    2: {
        1: 12,
        2: 9,
        pet: 12,
        to3: 6,
        to1: 5,
        tosleep: 5
    },
    1: {
        1: 12,
        2: 9,
        pet: 12,
        to2: 5,
        to0: 4,
        tosleep: 10
    },
    0: {
        to3: 14
    },
    sleep: {
        1: 7,
        2: 7,
        to1: 10,
        to2: 5,
        to3: 10
    }
};

function idle() {
    if (animator.animation == 0 && animator.state != 0 && animator.state != "sleep") {
        let randomIdle = Math.ceil(Math.random() * 2);
        animator.setAnimation(randomIdle);
    }

    let interval = 5000 + Math.random() * 3000;
    setTimeout(idle, interval);
}

function pet() {
    if (animator.animation == 0) {
        animator.setAnimation("pet");
    }
}

function stateChange() {
    if (!creature.isAsleep) {
        let newState = creature.health.state;
        if (newState != lastState) {
            lastState = newState;
            animator.setAnimation("to" + newState);
        }
    }
}

function nextFrame() {
    if (animator.animation != 0) {
        let length = animationLength[animator.state][animator.animation];
        let src = "";
        if (animator.frame >= length || length == undefined) {
            if (typeof animator.animation === "string") {
                if (animator.animation.slice(0, 2) === "to") {
                    animator.state = animator.animation.slice(2);
                    if (animator.state == 0) {
                        showInfo("death", "Whoops.", creature.name + " has died! All exp progress towards the next level has been lost.");
                    }
                }
            }
            animator.setAnimation(0);
            src = animator.getSrc();
        }
        else if (creature.animation != 0) {
            src = animator.getSrc();
            animator.increment();
        }
        creatureImg.src = src;
    } else {
        creatureImg.src = animator.getSrc();
    }
}


// =========== UI ==========

let info = document.getElementById("info");
let infoId = "none";
let root = document.querySelector(":root");

function updateUI() {
    root.style.setProperty("--health", creature.health.value+"%");
    root.style.setProperty("--exp", (creature.level.exp/creature.level.nextLevel)*100+"%");
    let glowSat = creature.health.value;
    let glowBright = 80;
    if (creature.health.state <= 1) {
        glowBright = 40 + (creature.health.value*2);
    }
    root.style.setProperty("--glow-1", `hsla(204, ${glowSat}%, ${glowBright}%, 1)`);
    root.style.setProperty("--glow-2", `hsla(204, ${glowSat}%, ${glowBright}%, 0.6)`);

    let name = document.getElementById("name");
    name.innerHTML = creature.name;
    let level = document.getElementById("level");
    level.innerHTML = "lvl " + creature.level.level;

    let timer = document.getElementById("focus-label");
    let totalSeconds = creature.sleepTimer;
    if (totalSeconds == 0) {
        timer.innerText = "";
    } else if (totalSeconds >= 3600) {
        timer.innerText = new Date(totalSeconds * 1000).toISOString().substring(11, 16);
    } else {
        timer.innerText = new Date(totalSeconds * 1000).toISOString().substring(14, 19);
    }
}

function changeTabs(tab) {
    document.getElementsByClassName("active")[0].classList.remove("active");
    document.getElementsByClassName("selected")[0].classList.remove("selected");
    document.getElementById(tab).classList.add("active");
    document.getElementById("menu-" + tab).classList.add("selected");
}

function showInfo(id, title, text) {
    infoId = id;
    info.children[0].innerText = title;
    info.children[1].innerText = text;
    info.style.display = "block";
    setTimeout(()=>{info.classList.remove("gone");}, 10);
}

function closeInfo() {
    info.classList.add("gone");
    if (infoId === "death") {
        creature.health.update(80);
    }
    setTimeout(() => {
        info.style.display = "none";
    }, 500);
}

function focus() {
    if (creature.state != 0 && !creature.isAsleep) {
        creature.isAsleep = true;
        saveCreature();
        chrome.runtime.sendMessage({type: "focusStart"});
        animator.setAnimation("tosleep");
        lastState = "sleep";
    }
}


// ========== TASKS ==========

function createTask(text, difficulty) {
    let newTask = document.createElement("div");
    newTask.classList.add("task");
    newTask.classList.add(difficulty);
    newTask.innerText = text;
    
    let checkBox = document.createElement("div");
    checkBox.classList.add("check");
    checkBox.addEventListener("click", checkTask);

    let deleteBox = document.createElement("div");
    deleteBox.classList.add("delete");
    deleteBox.addEventListener("click", deleteTask);

    newTask.appendChild(checkBox);
    newTask.appendChild(deleteBox);
    return newTask;
}

function checkTask() {
    let checkBox = this;
    let task = checkBox.parentElement;
    let difficulty = task.classList.item(1);
    task.remove();
    switch (difficulty) {
        case "easy":
            creature.level.update(15);
            break;
        case "hard":
            creature.level.update(50);
            break;
        case "medium":
        default:
            creature.level.update(25)
            break;
    }
    updateUI();
    saveTasks();
}

function deleteTask() {
    let checkBox = this;
    let task = checkBox.parentElement;
    task.remove();
    saveTasks();
}

function addTask(e) {
    if (e.key === "Enter" || e === "submit") {
        let entry = document.getElementById("task-input");
        let taskText = entry.value;
        if (taskText) {
            entry.value = "";
            let taskBox = document.getElementById("task-box");

            let difficultySrc = document.getElementById("task-difficulty").getAttribute("src");
            let difficulty = "";
            switch (difficultySrc) {
                case "assets/easy.png":
                    difficulty = "easy";
                    break;
                case "assets/medium.png":
                    difficulty = "medium";
                    break;
                case "assets/hard.png":
                    difficulty = "hard";
                    break;
            }

            let newTask = createTask(taskText, difficulty);

            taskBox.insertBefore(newTask, taskBox.children[1]);
            saveTasks();
        }
    }
}

function loadTasks() {
    chrome.storage.local.get("tasks", (data) => {
        if (data.tasks) {
            try {
                let tasks = data.tasks;
                let taskBox = document.getElementById("task-box");
                for (let task of tasks) {
                    let newTask = createTask(task[0], task[1]);
                    taskBox.appendChild(newTask);
                }
            } catch (err) {
                console.log("pp: invalid tasks");
            }
        } else {
            console.log("pp: no tasks")
        }
    });
}

function saveTasks() {
    let tasks = document.getElementsByClassName("task");
    let taskArray = [];
    for (let task of tasks) {
        taskArray.push([task.innerText, task.classList.item(1)]);
    }

    chrome.storage.local.set({tasks: taskArray}, () => {
        console.log("pp: tasks saved", taskArray);
    });
}

function changeDifficulty() {
    let image = this.getAttribute("src");
    switch (image) {
        case "assets/easy.png":
            this.src = "assets/medium.png";
            break;
        case "assets/medium.png":
            this.src = "assets/hard.png";
            break;
        case "assets/hard.png":
            this.src = "assets/easy.png";
            break;
    }
}


// ========== SETTINGS =========

let blacklist = [
    "tiktok.com",
    "x.com",
    "youtube.com"
];
let creatureName = "Greg";
let on = true;
let focusedTick = 1;
let normalTick = 0.25;
let distractedTick = 0.5;
let timerLength = 25;

function loadSettings() {
    chrome.storage.local.get("settings", (data) => {
        if (data.settings) {
            let json = data.settings;
            blacklist = json.blacklist;
            on = json.on;
            timerLength = json.timerLength;
            creatureName = json.creatureName;
        } else {
            console.log("pp: no settings data")
        }
    });
}

function saveSettings() {
    chrome.storage.local.set({settings: {
        blacklist: blacklist,
        on: on,
        timerLength: timerLength,
        creatureName: creatureName
    }}, () => {
        creature.name = creatureName;
        saveCreature();
        console.log("pp: settings saved");
        chrome.runtime.sendMessage({type: "settingsUpdated"});
    });
}

function submitSettings() {
    creatureName = document.getElementById("creatureName").value;
    timerLength = document.getElementById("timerLength").value;
    let strList = document.getElementById("blacklist").value;
    strList = strList.split(",");
    blacklist = strList.map((x) => x.trim());
    saveSettings();
}


// ========== MESSAGES ==========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "creatureUpdated":
            loadCreature();
            break;
    }
});


// ========== LISTENERS ==========

document.getElementById("creature-img").addEventListener("click", pet);
document.getElementById("focus").addEventListener("click", focus);
info.children[2].addEventListener("click", closeInfo);

document.getElementById("menu-pet").addEventListener("click", () => {changeTabs("pet");});
document.getElementById("menu-tasks").addEventListener("click", () => {changeTabs("tasks");});
document.getElementById("menu-stats").addEventListener("click", () => {changeTabs("stats");});
document.getElementById("menu-settings").addEventListener("click", () => {changeTabs("settings");});

document.getElementById("task-input").addEventListener("keypress", (e) => {addTask(e);});
document.getElementById("submit-task").addEventListener("click", () => {addTask("submit");})
document.getElementById("task-difficulty").addEventListener("click", changeDifficulty);

document.getElementById("settings-submit").addEventListener("click", submitSettings);

createCreature();
loadSettings();
loadTasks();
