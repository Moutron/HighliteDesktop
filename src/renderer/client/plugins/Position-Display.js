// Position Display Plugin
import { Plugin } from "@highlite/core";

// Inline CSS for the position display
const positionDisplayCSS = `
.position-display-container {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #ffd700;
  border-radius: 6px;
  padding: 10px 15px;
  color: #32cd32;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: bold;
  min-width: 180px;
  z-index: 9999;
  user-select: none;
  pointer-events: none;
}

.position-display-container.draggable {
  pointer-events: auto;
  cursor: move;
}

.position-display-title {
  color: #ffd700;
  font-size: 16px;
  margin-bottom: 8px;
  text-align: center;
  border-bottom: 1px solid #ffd700;
  padding-bottom: 4px;
}

.position-display-row {
  display: flex;
  justify-content: space-between;
  margin: 4px 0;
  color: #32cd32;
}

.position-display-label {
  color: #ffd700;
  margin-right: 10px;
}

.position-display-value {
  color: #32cd32;
  font-weight: bold;
}
`;

class PositionDisplay extends Plugin {
  constructor() {
    super();
    this.pluginName = "Position Display";
    this.author = "Highlite";
    this.cssInjected = false;
    this.displayContainer = null;
    this.xValueElement = null;
    this.yValueElement = null;
    this.levelValueElement = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
  }

  init() {
    this.log("Initializing " + this.pluginName);
  }

  start() {
    this.log("Started " + this.pluginName);
    this.injectStyles();
    this.createDisplayUI();
  }

  stop() {
    this.log("Stopped " + this.pluginName);
    this.cleanup();
  }

  GameLoop_update() {
    if (this.settings.enable.value && this.displayContainer) {
      this.updatePosition();
    }
  }

  injectStyles() {
    if (this.cssInjected) return;
    const style = document.createElement("style");
    style.textContent = positionDisplayCSS;
    document.head.appendChild(style);
    this.cssInjected = true;
  }

  createDisplayUI() {
    if (this.displayContainer) return;

    const hsMask = document.querySelector("#hs-screen-mask");
    if (!hsMask) {
      this.log("Cannot find hs-screen-mask element");
      return;
    }

    // Create container
    this.displayContainer = document.createElement("div");
    this.displayContainer.className = "position-display-container draggable";

    // Create title
    const title = document.createElement("div");
    title.className = "position-display-title";
    title.textContent = "Player Position";

    // Create X coordinate row
    const xRow = document.createElement("div");
    xRow.className = "position-display-row";
    const xLabel = document.createElement("span");
    xLabel.className = "position-display-label";
    xLabel.textContent = "X:";
    this.xValueElement = document.createElement("span");
    this.xValueElement.className = "position-display-value";
    this.xValueElement.textContent = "---";
    xRow.appendChild(xLabel);
    xRow.appendChild(this.xValueElement);

    // Create Y coordinate row
    const yRow = document.createElement("div");
    yRow.className = "position-display-row";
    const yLabel = document.createElement("span");
    yLabel.className = "position-display-label";
    yLabel.textContent = "Y:";
    this.yValueElement = document.createElement("span");
    this.yValueElement.className = "position-display-value";
    this.yValueElement.textContent = "---";
    yRow.appendChild(yLabel);
    yRow.appendChild(this.yValueElement);

    // Create Level row
    const levelRow = document.createElement("div");
    levelRow.className = "position-display-row";
    const levelLabel = document.createElement("span");
    levelLabel.className = "position-display-label";
    levelLabel.textContent = "Level:";
    this.levelValueElement = document.createElement("span");
    this.levelValueElement.className = "position-display-value";
    this.levelValueElement.textContent = "---";
    levelRow.appendChild(levelLabel);
    levelRow.appendChild(this.levelValueElement);

    // Append all elements
    this.displayContainer.appendChild(title);
    this.displayContainer.appendChild(xRow);
    this.displayContainer.appendChild(yRow);
    this.displayContainer.appendChild(levelRow);

    // Add drag functionality
    this.setupDragging();

    hsMask.appendChild(this.displayContainer);
  }

  setupDragging() {
    if (!this.displayContainer) return;

    this.displayContainer.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      const rect = this.displayContainer.getBoundingClientRect();
      this.dragOffset.x = e.clientX - rect.left;
      this.dragOffset.y = e.clientY - rect.top;
      this.displayContainer.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;

      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;

      this.displayContainer.style.top = `${y}px`;
      this.displayContainer.style.right = "auto";
      this.displayContainer.style.left = `${x}px`;
    });

    document.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.displayContainer.style.cursor = "move";
      }
    });
  }

  updatePosition() {
    const player = document?.highlite?.gameHooks?.EntityManager?.Instance?._mainPlayer;
    
    if (!player) {
      this.xValueElement.textContent = "---";
      this.yValueElement.textContent = "---";
      this.levelValueElement.textContent = "---";
      return;
    }

    const playerPosition = player._currentGamePosition;
    const playerLevel = player._currentMapLevel;

    if (playerPosition) {
      this.xValueElement.textContent = playerPosition._x.toString();
      this.yValueElement.textContent = playerPosition._z.toString();
    } else {
      this.xValueElement.textContent = "---";
      this.yValueElement.textContent = "---";
    }

    if (playerLevel !== undefined) {
      this.levelValueElement.textContent = this.getLevelName(playerLevel);
    } else {
      this.levelValueElement.textContent = "---";
    }
  }

  getLevelName(level) {
    switch (level) {
      case 0:
        return "Underground";
      case 1:
        return "Overworld";
      case 2:
        return "Sky";
      default:
        return level.toString();
    }
  }

  cleanup() {
    if (this.displayContainer) {
      this.displayContainer.remove();
      this.displayContainer = null;
      this.xValueElement = null;
      this.yValueElement = null;
      this.levelValueElement = null;
    }
  }
}

export default PositionDisplay;

