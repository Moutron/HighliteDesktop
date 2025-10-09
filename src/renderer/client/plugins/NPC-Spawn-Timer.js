// NPC Spawn Timer Plugin
import { Plugin } from "@highlite/core";

// Inline CSS for the spawn timer UI
const spawnTimerCSS = `
.npc-spawn-timer-container {
  position: absolute;
  top: 60px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.85);
  border: 2px solid #ffd700;
  border-radius: 6px;
  padding: 10px;
  color: #32cd32;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  min-width: 250px;
  max-width: 350px;
  max-height: 400px;
  overflow-y: auto;
  z-index: 9998;
  user-select: none;
}

.npc-spawn-timer-container.draggable {
  cursor: move;
}

.npc-spawn-timer-header {
  color: #ffd700;
  font-size: 15px;
  font-weight: bold;
  text-align: center;
  border-bottom: 1px solid #ffd700;
  padding-bottom: 5px;
  margin-bottom: 10px;
}

.npc-spawn-timer-empty {
  color: #888;
  text-align: center;
  font-style: italic;
  padding: 20px 0;
}

.npc-timer-entry {
  background-color: rgba(255, 215, 0, 0.1);
  border-left: 3px solid #ffd700;
  padding: 8px;
  margin: 5px 0;
  border-radius: 3px;
  transition: all 0.2s;
}

.npc-timer-entry:hover {
  background-color: rgba(255, 215, 0, 0.2);
}

.npc-timer-entry.spawning-soon {
  border-left-color: #ff4444;
  animation: pulse 1s infinite;
}

.npc-timer-entry.spawned {
  border-left-color: #44ff44;
  background-color: rgba(68, 255, 68, 0.2);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.npc-timer-name {
  color: #ffd700;
  font-weight: bold;
  margin-bottom: 3px;
}

.npc-timer-location {
  color: #aaa;
  font-size: 11px;
  margin-bottom: 3px;
}

.npc-timer-countdown {
  color: #32cd32;
  font-weight: bold;
  font-size: 14px;
}

.npc-timer-countdown.soon {
  color: #ff4444;
}

.npc-timer-countdown.spawned {
  color: #44ff44;
}

.npc-timer-remove {
  float: right;
  color: #ff4444;
  cursor: pointer;
  font-weight: bold;
  padding: 0 5px;
  border-radius: 3px;
}

.npc-timer-remove:hover {
  background-color: rgba(255, 68, 68, 0.3);
}

/* Scrollbar styling */
.npc-spawn-timer-container::-webkit-scrollbar {
  width: 8px;
}

.npc-spawn-timer-container::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.npc-spawn-timer-container::-webkit-scrollbar-thumb {
  background: #ffd700;
  border-radius: 4px;
}

.npc-spawn-timer-container::-webkit-scrollbar-thumb:hover {
  background: #ffed4e;
}
`;

class NPCSpawnTimer extends Plugin {
  constructor() {
    super();
    this.pluginName = "NPC Spawn Timer";
    this.author = "Highlite";
    this.cssInjected = false;
    this.timerContainer = null;
    this.trackedNPCs = new Map(); // Map<npcId, timerData>
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    
    // Default respawn times (in seconds) - can be configured
    this.defaultRespawnTime = 120; // 2 minutes default
    
    // Custom respawn times based on High Spell bestiary data
    this.customRespawnTimes = {
      // World Bosses & Special (10-15 min)
      "King Goblin Jockey": 900,
      "Damogui": 900,
      "Isradore's Dragon": 900,
      
      // Dragons (8-10 min)
      "Fire Dragon": 600,
      "Water Dragon": 600,
      "Plains Dragon": 600,
      
      // High-level Elites (5-7 min)
      "Elder Knight": 420,
      "Hell Giant": 420,
      "Corrupt Minotaur": 360,
      "Cave Bear": 360,
      
      // Giants & Minotaurs (4-5 min)
      "Frost Giant": 300,
      "Hell Warrior": 300,
      "Minotaur": 300,
      "Forest Giant": 240,
      "Giant": 240,
      
      // High-level Knights & Warriors (3-4 min)
      "Knight": 240,
      "Elder Knight": 420,
      "Forest Warrior": 180,
      "Frost Warrior": 180,
      
      // Dragons Hatchlings (2-3 min)
      "Dragon Hatchling": 150,
      
      // Mid-tier enemies (1.5-2 min)
      "Brute": 120,
      "Dark Monk": 120,
      "Skeletal Mage": 120,
      "Giant Skeleton": 180,
      
      // Common high-level (1 min)
      "Suit Of Armour": 60,
      "Blood Mage": 60,
      "Charred Skeleton": 60,
    };
    
    // Alert threshold (seconds before spawn to show alert)
    this.alertThreshold = 15; // 15 seconds warning
    
    // Auto-track settings - only track NPCs matching these criteria
    this.autoTrackEnabled = true;
    this.minNPCLevel = 30; // Only track level 30+ NPCs (adjusted based on bestiary)
    this.trackBosses = true; // Track NPCs with boss keywords
    
    // Keywords for important NPCs (based on bestiary analysis)
    this.bossKeywords = [
      "dragon", "giant", "knight", "elder", "king", "boss", "warrior", 
      "minotaur", "isradore", "damogui", "hell", "frost", "corrupt"
    ];
    
    // Blacklist low-level trash mobs (levels 1-20 commons)
    this.blacklistedNames = [
      "rat", "chicken", "cow", "squirrel", "rooster", "farmer", 
      "nisse", "man", "old man", "fisherman", "lumberjack",
      "sewer rat", "cave chicken", "bear cub"
    ];
  }

  init() {
    this.log("Initializing " + this.pluginName);
  }

  start() {
    this.log("Started " + this.pluginName);
    this.injectStyles();
    this.createTimerUI();
    this.setupNPCTracking();
  }

  stop() {
    this.log("Stopped " + this.pluginName);
    this.cleanup();
  }

  GameLoop_update() {
    if (this.settings.enable.value && this.timerContainer) {
      this.monitorNPCHealth(); // Check for NPC deaths
      this.updateTimers();      // Update countdown timers
    }
  }

  injectStyles() {
    if (this.cssInjected) return;
    const style = document.createElement("style");
    style.textContent = spawnTimerCSS;
    document.head.appendChild(style);
    this.cssInjected = true;
  }

  createTimerUI() {
    if (this.timerContainer) return;

    const hsMask = document.querySelector("#hs-screen-mask");
    if (!hsMask) {
      this.log("Cannot find hs-screen-mask element");
      return;
    }

    // Create container
    this.timerContainer = document.createElement("div");
    this.timerContainer.className = "npc-spawn-timer-container draggable";

    // Create header
    const header = document.createElement("div");
    header.className = "npc-spawn-timer-header";
    header.textContent = "NPC Spawn Timers";

    // Create content area
    this.timerContent = document.createElement("div");
    this.timerContent.className = "npc-spawn-timer-content";
    this.updateTimerDisplay();

    this.timerContainer.appendChild(header);
    this.timerContainer.appendChild(this.timerContent);

    // Add drag functionality
    this.setupDragging();

    hsMask.appendChild(this.timerContainer);
  }

  setupDragging() {
    if (!this.timerContainer) return;

    const header = this.timerContainer.querySelector(".npc-spawn-timer-header");
    
    header.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      const rect = this.timerContainer.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      header.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;

      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;

      this.timerContainer.style.top = `${y}px`;
      this.timerContainer.style.right = "auto";
      this.timerContainer.style.left = `${x}px`;
    });

    document.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        const header = this.timerContainer.querySelector(".npc-spawn-timer-header");
        header.style.cursor = "move";
      }
    });
  }

  setupNPCTracking() {
    // Hook into NPC system to detect deaths/despawns
    const entityManager = document?.highlite?.gameHooks?.EntityManager?.Instance;
    
    if (!entityManager) {
      this.log("EntityManager not available yet");
      setTimeout(() => this.setupNPCTracking(), 1000);
      return;
    }

    this.entityManager = entityManager;
    this.trackedNPCIds = new Set(); // Track which NPCs we're monitoring
    this.npcHealthMap = new Map(); // Map<npcId, lastKnownHealth>
    
    this.log("NPC tracking initialized - monitoring NPC deaths");
  }

  // Monitor NPC health and detect deaths
  monitorNPCHealth() {
    if (!this.entityManager || !this.entityManager._npcs) return;

    const npcs = this.entityManager._npcs;
    const currentNPCIds = new Set();

    // Check all currently alive NPCs
    for (const [npcId, npc] of npcs) {
      if (!npc || !npc._def) continue;
      
      currentNPCIds.add(npcId);
      
      // Get NPC health
      const hitpoints = npc._hitpoints || npc.Hitpoints;
      if (!hitpoints) continue;
      
      const currentHP = hitpoints._currentLevel || hitpoints._level || 0;
      const maxHP = hitpoints._level || 100;
      
      // Store health info
      if (!this.npcHealthMap.has(npcId)) {
        this.npcHealthMap.set(npcId, { hp: currentHP, maxHP: maxHP, name: npc._def._name });
      } else {
        const stored = this.npcHealthMap.get(npcId);
        
        // Detect death (health went to 0 or NPC about to despawn)
        if (stored.hp > 0 && currentHP === 0) {
          this.onNPCDeath(npcId, npc);
        }
        
        stored.hp = currentHP;
      }
    }

    // Check for NPCs that disappeared (despawned)
    for (const [npcId, healthData] of this.npcHealthMap) {
      if (!currentNPCIds.has(npcId) && healthData.hp === 0) {
        // NPC died and despawned - check if we should track it
        if (!this.trackedNPCs.has(npcId)) {
          // Apply filter if we have NPC reference
          if (healthData.npcRef && !this.shouldTrackNPC(healthData.npcRef, healthData.name)) {
            this.npcHealthMap.delete(npcId);
            continue;
          }
          
          const position = healthData.position || { x: 0, y: 0 };
          const level = healthData.level || 1;
          this.trackNPCDeath(npcId, healthData.name, position, level);
        }
        this.npcHealthMap.delete(npcId);
      }
    }
  }

  // Check if an NPC should be auto-tracked based on filters
  shouldTrackNPC(npc, npcName) {
    if (!this.autoTrackEnabled) return false;
    
    const nameLower = npcName.toLowerCase();
    
    // Check blacklist first
    for (const blacklisted of this.blacklistedNames) {
      if (nameLower.includes(blacklisted.toLowerCase())) {
        return false;
      }
    }
    
    // Check for boss keywords
    if (this.trackBosses) {
      for (const keyword of this.bossKeywords) {
        if (nameLower.includes(keyword.toLowerCase())) {
          return true;
        }
      }
    }
    
    // Check NPC level (combat level)
    const combatLevel = npc._combat?._level || 0;
    if (combatLevel >= this.minNPCLevel) {
      return true;
    }
    
    return false;
  }

  // Called when an NPC dies
  onNPCDeath(npcId, npc) {
    if (!npc || !npc._def) return;
    
    const name = npc._def._nameCapitalized || npc._def._name || `NPC ${npcId}`;
    const position = {
      x: Math.round(npc._currentGamePosition?._x || npc._lastGamePosition?._x || 0),
      y: Math.round(npc._currentGamePosition?._z || npc._lastGamePosition?._z || 0)
    };
    const level = npc._currentMapLevel || 1;
    
    // Store position and level for when it despawns
    const healthData = this.npcHealthMap.get(npcId);
    if (healthData) {
      healthData.position = position;
      healthData.level = level;
      healthData.npcRef = npc; // Store reference for filtering
    }
    
    this.log(`NPC died: ${name} at (${position.x}, ${position.y})`);
  }

  // Called when an NPC dies or despawns
  trackNPCDeath(npcId, npcName, position, level) {
    const respawnTime = this.customRespawnTimes[npcName] || this.defaultRespawnTime;
    const spawnTimestamp = Date.now() + (respawnTime * 1000);

    const timerData = {
      id: npcId,
      name: npcName,
      position: position,
      level: level,
      spawnTimestamp: spawnTimestamp,
      respawnTime: respawnTime,
      alerted: false
    };

    this.trackedNPCs.set(npcId, timerData);
    this.updateTimerDisplay();
    
    this.log(`Tracking ${npcName} - respawn in ${respawnTime}s`);
  }

  updateTimers() {
    const now = Date.now();
    let needsUpdate = false;
    let hasAlert = false;

    for (const [npcId, timer] of this.trackedNPCs) {
      const timeRemaining = Math.max(0, Math.floor((timer.spawnTimestamp - now) / 1000));
      
      // Check if spawned
      if (timeRemaining === 0) {
        if (!timer.spawned) {
          timer.spawned = true;
          needsUpdate = true;
          this.showNotification(`${timer.name} has spawned!`);
        }
      }
      
      // Check if alert threshold reached
      else if (timeRemaining <= this.alertThreshold && !timer.alerted) {
        timer.alerted = true;
        hasAlert = true;
        needsUpdate = true;
        this.showNotification(`${timer.name} spawning in ${timeRemaining}s!`, "warning");
      }
    }

    // Clean up spawned timers after 30 seconds
    for (const [npcId, timer] of this.trackedNPCs) {
      if (timer.spawned && (now - timer.spawnTimestamp) > 30000) {
        this.trackedNPCs.delete(npcId);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      this.updateTimerDisplay();
    }
  }

  updateTimerDisplay() {
    if (!this.timerContent) return;

    // Clear existing content
    this.timerContent.innerHTML = "";

    if (this.trackedNPCs.size === 0) {
      const empty = document.createElement("div");
      empty.className = "npc-spawn-timer-empty";
      empty.textContent = "No NPCs tracked";
      this.timerContent.appendChild(empty);
      return;
    }

    const now = Date.now();
    
    // Sort by time remaining
    const sortedTimers = Array.from(this.trackedNPCs.values()).sort((a, b) => 
      a.spawnTimestamp - b.spawnTimestamp
    );

    for (const timer of sortedTimers) {
      const entry = document.createElement("div");
      entry.className = "npc-timer-entry";
      
      const timeRemaining = Math.max(0, Math.floor((timer.spawnTimestamp - now) / 1000));
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      
      // Determine status
      let timeText, timeClass;
      if (timeRemaining === 0) {
        timeText = "SPAWNED!";
        timeClass = "spawned";
        entry.classList.add("spawned");
      } else if (timeRemaining <= this.alertThreshold) {
        timeText = `${timeRemaining}s`;
        timeClass = "soon";
        entry.classList.add("spawning-soon");
      } else {
        timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        timeClass = "";
      }

      // Remove button
      const removeBtn = document.createElement("span");
      removeBtn.className = "npc-timer-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove timer";
      removeBtn.onclick = () => {
        this.trackedNPCs.delete(timer.id);
        this.updateTimerDisplay();
      };

      // NPC name
      const name = document.createElement("div");
      name.className = "npc-timer-name";
      name.textContent = timer.name;
      name.appendChild(removeBtn);

      // Location
      const location = document.createElement("div");
      location.className = "npc-timer-location";
      const levelName = this.getLevelName(timer.level);
      location.textContent = `${levelName} (${timer.position.x}, ${timer.position.y})`;

      // Countdown
      const countdown = document.createElement("div");
      countdown.className = `npc-timer-countdown ${timeClass}`;
      countdown.textContent = timeText;

      entry.appendChild(name);
      entry.appendChild(location);
      entry.appendChild(countdown);
      
      this.timerContent.appendChild(entry);
    }
  }

  getLevelName(level) {
    switch (level) {
      case 0: return "Underground";
      case 1: return "Overworld";
      case 2: return "Sky";
      default: return `Level ${level}`;
    }
  }

  showNotification(message, type = "info") {
    // Use browser notification if permission granted
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("NPC Spawn Timer", {
        body: message,
        icon: "/icons/icon.png"
      });
    }
    
    this.log(message);
  }

  // Helper method for testing - add an NPC manually
  addTestNPC(name, respawnSeconds = null) {
    const testId = `test_${Date.now()}`;
    const position = { x: 100, y: 200 };
    const level = 1;
    const respawnTime = respawnSeconds || this.defaultRespawnTime;
    
    this.trackNPCDeath(testId, name, position, level);
  }

  cleanup() {
    if (this.timerContainer) {
      this.timerContainer.remove();
      this.timerContainer = null;
      this.timerContent = null;
    }
    this.trackedNPCs.clear();
    if (this.npcHealthMap) {
      this.npcHealthMap.clear();
    }
    if (this.trackedNPCIds) {
      this.trackedNPCIds.clear();
    }
  }
}

export default NPCSpawnTimer;

