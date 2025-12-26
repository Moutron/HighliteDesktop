import { Plugin, SettingsTypes, ActionState } from '@highlite/core';
import { Vector3 } from '@babylonjs/core/Maths/math.js';

/**
 * TreeCutterBot
 *
 * NOTE: This is a local automation plugin. It drives the client by:
 * - Finding nearby world entities (trees/bank) via hooks
 * - Clicking them via synthesized mouse events on the game canvas
 * - Depositing logs by clicking inventory slots while the bank UI is open
 *
 * Because High Spell’s upstream client can change, some selectors/names may need
 * tuning via the plugin settings (tree/bank/log name filters).
 */
export default class TreeCutterBot extends Plugin {
    constructor() {
        super();

        this.pluginName = 'Tree Cutter Bot';
        this.author = 'Custom (local)';

        this.lastActionAt = 0;
        this.pendingBankOpenAt = 0;
        this.state = 'cutting'; // "cutting" | "banking"

        this.settings.tickIntervalMs = {
            text: 'Bot tick interval (ms)',
            type: SettingsTypes.range,
            value: 650,
            min: 150,
            max: 5000,
            callback: () => {},
        };

        this.settings.treeNameIncludes = {
            text: 'Tree name contains (default: tree)',
            type: SettingsTypes.text,
            value: 'tree',
            callback: () => {},
        };

        this.settings.treeNameExcludes = {
            text: 'Tree name excludes (comma-separated)',
            type: SettingsTypes.text,
            value: 'oak,willow,yew,magic',
            callback: () => {},
        };

        this.settings.bankNameIncludes = {
            text: 'Bank name contains (default: bank)',
            type: SettingsTypes.text,
            value: 'bank',
            callback: () => {},
        };

        this.settings.logNameIncludes = {
            text: 'Log item name contains (default: log)',
            type: SettingsTypes.text,
            value: 'log',
            callback: () => {},
        };

        this.settings.maxTargetDistance = {
            text: 'Max target distance (tiles-ish)',
            type: SettingsTypes.range,
            value: 30,
            min: 3,
            max: 100,
            callback: () => {},
        };

        this.settings.debug = {
            text: 'Debug logging',
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {},
        };
    }

    init() {
        this.log('Initialized');
    }

    start() {
        if (!this.settings.enable.value) return;
        this.log('Started');
        this.lastActionAt = 0;
        this.pendingBankOpenAt = 0;
        this.state = 'cutting';
    }

    stop() {
        this.log('Stopped');
        this.lastActionAt = 0;
        this.pendingBankOpenAt = 0;
        this.state = 'cutting';
    }

    GameLoop_update() {
        if (!this.settings.enable.value) return;

        const now = Date.now();
        if (now - this.lastActionAt < this.settings.tickIntervalMs.value) {
            return;
        }

        const player =
            this.gameHooks?.EntityManager?.Instance?.MainPlayer ??
            this.gameHooks?.EntityManager?.Instance?._mainPlayer;
        if (!player) return;

        const currentState =
            player?._currentState?.getCurrentState?.() ??
            player?._currentState?.GetCurrentState?.();

        // If we're currently doing an action, don't spam more clicks.
        if (
            currentState === ActionState.WoodcuttingState ||
            currentState === ActionState.TreeShakingState ||
            currentState === ActionState.MovingState ||
            currentState === ActionState.MovingTowardTargetState
        ) {
            return;
        }

        const inventoryItems = this.getInventoryItems(player);
        if (!inventoryItems) return;

        const isFull = this.isInventoryFull(inventoryItems);
        const bankVisible = this.isBankMenuVisible();

        // If full, ensure we bank.
        if (isFull) {
            this.state = 'banking';
        }

        if (this.state === 'banking') {
            // Step 1: open bank (click bank entity) if not open
            if (!bankVisible) {
                const bankEntity = this.findNearestWorldEntityByName(
                    this.settings.bankNameIncludes.value,
                    [],
                    player
                );
                if (!bankEntity) {
                    this.debugLog('No bank entity found nearby.');
                    this.lastActionAt = now;
                    return;
                }

                this.debugLog(
                    `Clicking bank entity '${bankEntity._name}' (type=${bankEntity._entityTypeId}).`
                );
                this.clickWorldEntity(bankEntity);
                this.pendingBankOpenAt = now;
                this.lastActionAt = now;
                return;
            }

            // Step 2: deposit logs while bank is open
            const logSlots = this.getInventorySlotsByNameIncludes(
                inventoryItems,
                this.settings.logNameIncludes.value
            );
            if (logSlots.length === 0) {
                // Done banking
                this.debugLog(
                    'No logs found in inventory; returning to cutting.'
                );
                this.state = 'cutting';
                this.lastActionAt = now;
                return;
            }

            // Deposit one slot per tick to avoid overwhelming the UI.
            const slot = logSlots[0];
            const clicked = this.clickInventorySlot(slot);
            this.debugLog(
                clicked
                    ? `Depositing logs from inventory slot ${slot}.`
                    : `Failed to click inventory slot ${slot} for deposit.`
            );
            this.lastActionAt = now;
            return;
        }

        // Cutting flow
        if (this.state === 'cutting') {
            // If we accidentally left bank open, let the user close it manually.
            if (bankVisible) {
                this.lastActionAt = now;
                return;
            }

            // If inventory got full, we’ll switch next tick.
            if (isFull) {
                this.state = 'banking';
                this.lastActionAt = now;
                return;
            }

            // If idle and not targeting, click nearest regular tree.
            const currentTarget =
                player?._currentTarget ?? player?.CurrentTarget;
            if (currentState !== ActionState.IdleState || currentTarget) {
                return;
            }

            const excludes = this.settings.treeNameExcludes.value
                .split(',')
                .map(s => s.trim().toLowerCase())
                .filter(Boolean);

            const treeEntity = this.findNearestWorldEntityByName(
                this.settings.treeNameIncludes.value,
                excludes,
                player
            );
            if (!treeEntity) {
                this.debugLog('No tree entity found nearby.');
                this.lastActionAt = now;
                return;
            }

            this.debugLog(
                `Clicking tree entity '${treeEntity._name}' (type=${treeEntity._entityTypeId}).`
            );
            this.clickWorldEntity(treeEntity);
            this.lastActionAt = now;
        }
    }

    debugLog(message) {
        if (!this.settings.debug.value) return;
        this.log(`[TreeCutterBot] ${message}`);
    }

    getInventoryItems(player) {
        return (
            player?.Inventory?.Items ??
            player?._inventory?.Items ??
            player?._inventory?.items ??
            null
        );
    }

    isInventoryFull(items) {
        if (!Array.isArray(items) || items.length === 0) return false;
        return items.every(i => i != null);
    }

    getInventorySlotsByNameIncludes(items, nameIncludes) {
        const needle = String(nameIncludes || '')
            .toLowerCase()
            .trim();
        if (!needle) return [];

        const slots = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const name =
                it?._def?._nameCapitalized ??
                it?._def?._name ??
                it?._def?.Name ??
                '';
            if (String(name).toLowerCase().includes(needle)) {
                slots.push(i);
            }
        }
        return slots;
    }

    isBankMenuVisible() {
        const bankMenu = document.getElementById('hs-bank-menu');
        if (!bankMenu) return false;
        const style = window.getComputedStyle(bankMenu);
        if (style.display === 'none' || style.visibility === 'hidden')
            return false;
        return true;
    }

    clickInventorySlot(slot) {
        const cell = document.querySelector(
            `.hs-item-table--inventory .hs-item-table__cell[data-slot="${slot}"]`
        );
        if (!(cell instanceof HTMLElement)) return false;
        // Click should deposit while bank is open (game handles actual action).
        cell.click();
        return true;
    }

    findNearestWorldEntityByName(nameIncludes, nameExcludes, player) {
        const worldEntities =
            this.gameHooks?.WorldEntityManager?.Instance?.WorldEntities;
        if (!worldEntities) return null;

        const include = String(nameIncludes || '')
            .toLowerCase()
            .trim();
        const excludes = (nameExcludes || []).map(s => String(s).toLowerCase());

        const playerPos = this.getPlayerWorldPosition(player);
        if (!playerPos) return null;

        let best = null;
        let bestDist = Infinity;

        for (const [, entity] of worldEntities) {
            if (!entity || !entity._name) continue;
            const name = String(entity._name).toLowerCase();
            if (include && !name.includes(include)) continue;
            if (excludes.some(ex => ex && name.includes(ex))) continue;

            const entPos = this.getEntityWorldPosition(entity);
            if (!entPos) continue;
            const d = this.distanceXZ(playerPos, entPos);
            if (d > this.settings.maxTargetDistance.value) continue;

            if (d < bestDist) {
                best = entity;
                bestDist = d;
            }
        }

        return best;
    }

    getPlayerWorldPosition(player) {
        const pos =
            player?._currentGamePosition ??
            player?.CurrentGamePosition ??
            player?._lastGamePosition ??
            null;
        if (!pos) return null;
        // Babylon-like Vector3 on some paths, or game position with _x/_z.
        const x = pos._x ?? pos.X ?? pos.x ?? 0;
        const z = pos._z ?? pos.Z ?? pos.z ?? 0;
        return { x, z };
    }

    getEntityWorldPosition(entity) {
        try {
            const mesh = entity?._appearance?._bjsMeshes?.[0];
            const p = mesh?.absolutePosition;
            if (!p) return null;
            return {
                x: p.x ?? p._x ?? 0,
                z: p.z ?? p._z ?? 0,
                y: p.y ?? p._y ?? 0,
            };
        } catch {
            return null;
        }
    }

    distanceXZ(a, b) {
        const dx = (a.x ?? 0) - (b.x ?? 0);
        const dz = (a.z ?? 0) - (b.z ?? 0);
        return Math.sqrt(dx * dx + dz * dz);
    }

    projectEntityToScreen(entity) {
        const mesh = entity?._appearance?._bjsMeshes?.[0];
        if (!mesh) return null;
        const engine = this.gameHooks?.GameEngine?.Instance;
        const scene = engine?.Scene;
        const canvas = engine?.Canvas;
        const camera = this.gameHooks?.GameCameraManager?.Camera;
        if (!scene || !canvas || !camera) return null;

        // If not in camera frustum, skip.
        try {
            if (
                typeof camera.isInFrustum === 'function' &&
                !camera.isInFrustum(mesh)
            ) {
                return null;
            }
        } catch {
            // ignore
        }

        const coords = Vector3.Project(
            Vector3.ZeroReadOnly,
            mesh.getWorldMatrix(),
            scene.getTransformMatrix(),
            camera.viewport.toGlobal(
                engine.Engine.getRenderWidth(1),
                engine.Engine.getRenderHeight(1)
            )
        );

        // coords are in canvas-space pixels.
        const rect = canvas.getBoundingClientRect();
        const clientX = rect.left + coords.x;
        const clientY = rect.top + coords.y;
        return { clientX, clientY, canvas };
    }

    clickWorldEntity(entity) {
        const projected = this.projectEntityToScreen(entity);
        if (!projected) return false;

        const { canvas, clientX, clientY } = projected;
        const opts = {
            clientX,
            clientY,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons: 1,
        };

        try {
            canvas.dispatchEvent(new MouseEvent('mousemove', opts));
            canvas.dispatchEvent(new MouseEvent('mousedown', opts));
            canvas.dispatchEvent(new MouseEvent('mouseup', opts));
            canvas.dispatchEvent(new MouseEvent('click', opts));
            return true;
        } catch (e) {
            this.debugLog(`Failed to click world entity: ${String(e)}`);
            return false;
        }
    }
}
