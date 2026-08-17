# Jenne Party Crunch

An advanced party management, grouping, and cross-scene teleportation utility built for **Foundry VTT (v13 & v14)** as part of the **Jenne Suite**.

---

## 🌟 Overview

**Jenne Party Crunch** replaces cumbersome token micromanagement with an intuitive "Crunch & Explode" party mechanism. 

Collapse arbitrary groups of scene tokens into a single **Party Token** for seamless dungeon exploration, wilderness overland travel, and multi-scene transitions. When danger strikes, **Uncrunch** to deploy party members around the party token instantly.

---

## 🚀 Key Features

- **Cross-Scene Teleportation Support**: Serializes member token state (HP, attributes, bar configurations, resources) directly into the Party Token's document flags (`flags["jenne-party-crunch"].members`). When the Party Token transitions between scenes or is cloned by teleporter modules, the entire party state travels with it.
- **Clean Canvas State**: Absorbs member tokens completely upon crunching—preventing unwanted Fog of War exploration, accidental player vision reveals, or hidden tokens lingering at canvas origin `(0, 0)`.
- **ApplicationV2 Party Manager HUD**: Modern, non-blocking floating HUD window:
  - **Crunched Parties List**: View all active party tokens in the current scene.
  - **Individual Tokens List**: View all standalone tokens on the canvas alongside members currently inside crunched parties.
  - **Interactive Membership Management**: Select a party to highlight its members; add or remove individual tokens on the fly.
  - **One-Click Uncrunch**: Reconstruct and place all party members onto the canvas around the party token.
- **Jenne Suite Controls**: Integrated directly into the unified `Jenne Suite` sidebar tool group in Foundry's scene controls toolbar.

---

## 📁 Repository Structure

```text
jenne-party-crunch/
├── artwork/                       # Module icons and graphics
├── audio/                         # Crunch and explode sound effects
├── css/
│   └── party-crunch.css           # HUD styles & layout
├── lang/
│   ├── de.json                    # German localization
│   └── en.json                    # English localization
├── packs/                         # Included compendiums & macro packs
├── scripts/
│   ├── config.js                  # Settings registration & constants
│   ├── hud.js                     # ApplicationV2 Party Manager HUD
│   ├── logger.js                  # Module debug & status logger
│   └── main.js                    # Core serialization & scene control hooks
├── templates/
│   └── party-hud.hbs              # Party HUD Handlebars template
├── module.json                    # Foundry VTT module manifest
└── README.md                      # Documentation
```

---

## 🧩 Dependencies & Relationships

### Required
- **`jenne-suite`**: Core interface toolbar and suite coordination
- **`jenne-asset-manager`**: Asset management and compendium integration

### Optional / Recommended
- **`JB2A_DnD5e` / `jb2a_patreon`**: Visual particle and spell effects
- **`autoanimations`**: Automatic animations on crunch/explode transitions
- **`sequencer`**: Orchestrated visual and audio sequencing

---

## ⚙️ Configuration & Setup

1. Enable **Jenne Party Crunch** in your World Settings -> Manage Modules.
2. In **Game Settings -> Module Settings -> Jenne Party Crunch**:
   - Set the **Default Party Actor ID** to an Actor in your world that will serve as the default Party Token template (e.g. a wagon, party banner, or party icon).

---

## 🎮 How to Use

1. Open the Foundry VTT canvas as GM.
2. Click the **Jenne Suite** icon on the left scene controls toolbar, then select **Party Crunch**.
3. In the **Party Crunch Manager HUD**:
   - Click **Create New Party** to spawn a new Party Token.
   - Select individual scene tokens and click **Add to Party** to absorb them into the active party token.
   - Click the **Uncrunch** button (`<i class="fa-solid fa-box-open"></i>`) on any crunched party to unpack all member tokens onto the canvas and dismiss the party token.
   - Move or teleport the Party Token across scenes—when you uncrunch in the destination scene, all party members spawn with their states intact.

---

## 📜 License

Created for the Jenne Suite for Foundry VTT.
