import { PartyCruncher } from './main.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PartyCrunchHUD extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.selectedPartyId = null;
        this.selectedIndividualIds = new Set();
        this.actorTypeFilter = "all";
        this.selectedActorUuid = null;
        
        // Listen to canvas and actor updates to re-render when tokens or actors change
        this._tokenCreateHook = Hooks.on('createToken', this._onCanvasChange.bind(this));
        this._tokenUpdateHook = Hooks.on('updateToken', this._onCanvasChange.bind(this));
        this._tokenDeleteHook = Hooks.on('deleteToken', this._onCanvasChange.bind(this));
        this._actorCreateHook = Hooks.on('createActor', this._onCanvasChange.bind(this));
        this._actorDeleteHook = Hooks.on('deleteActor', this._onCanvasChange.bind(this));
    }

    _onCanvasChange() {
        if (this.rendered) {
            this.render();
        }
    }

    static DEFAULT_OPTIONS = {
        id: "jenne-party-crunch-hud",
        classes: ["jenne-party-crunch-window"],
        title: "Party Crunch Manager",
        window: {
            icon: "fa-solid fa-users-viewfinder",
            resizable: true,
        },
        position: {
            width: 800,
            height: 560
        },
        actions: {
            createParty: PartyCrunchHUD.createParty,
            toggleCrunch: PartyCrunchHUD.toggleCrunch,
            deleteParty: PartyCrunchHUD.deleteParty,
            uncrunch: PartyCrunchHUD.uncrunch,
            addTokens: PartyCrunchHUD.addTokens,
            removeTokens: PartyCrunchHUD.removeTokens,
            selectParty: PartyCrunchHUD.selectParty,
            selectIndividual: PartyCrunchHUD.selectIndividual,
            changeTypeFilter: PartyCrunchHUD.changeTypeFilter,
            changeSelectedActor: PartyCrunchHUD.changeSelectedActor
        }
    };

    static PARTS = {
        main: {
            template: "modules/jenne-party-crunch/templates/party-hud.hbs"
        }
    };

    async _prepareContext(options) {
        // 1. Scene Parties
        const parties = PartyCruncher.getCrunchedTokens().map(t => {
            const members = t.getFlag(PartyCruncher.FLAG_SCOPE, PartyCruncher.FLAG_KEY_MEMBERS) || [];
            const isCrunched = t.getFlag(PartyCruncher.FLAG_SCOPE, PartyCruncher.FLAG_KEY_CRUNCHED) ?? false;
            return {
                id: t.id,
                name: t.name,
                img: t.texture?.src || t.document?.texture?.src || "icons/svg/mystery-man.svg",
                selected: this.selectedPartyId === t.id,
                isCrunched: isCrunched,
                memberCount: members.length,
                isSingle: members.length === 1
            };
        });

        // Selected Party object if valid
        let selectedParty = parties.find(p => p.id === this.selectedPartyId) || null;
        if (!selectedParty && parties.length > 0 && this.selectedPartyId) {
            this.selectedPartyId = null;
        }

        // 2. Individual Tokens & Members
        const individualsData = PartyCruncher.getIndividuals();
        const individuals = individualsData.map(i => ({
            ...i,
            selected: this.selectedIndividualIds.has(i.id),
            inSelectedParty: i.inParty === this.selectedPartyId
        }));

        const canAdd = this.selectedPartyId && this.selectedIndividualIds.size > 0 && Array.from(this.selectedIndividualIds).some(id => {
            const ind = individuals.find(i => i.id === id);
            return ind && (!ind.inParty || ind.inParty !== this.selectedPartyId);
        });
        
        const canRemove = this.selectedPartyId && this.selectedIndividualIds.size > 0 && Array.from(this.selectedIndividualIds).some(id => {
            const ind = individuals.find(i => i.id === id);
            return ind && ind.inParty === this.selectedPartyId;
        });

        // 3. Actor Types List
        const allActors = game.actors ? game.actors.contents : [];
        const presentTypes = new Set(allActors.map(a => a.type));
        
        if (CONFIG.Actor?.typeLabels) {
            Object.keys(CONFIG.Actor.typeLabels).forEach(t => presentTypes.add(t));
        }
        if (Array.isArray(game.documentTypes?.Actor)) {
            game.documentTypes.Actor.forEach(t => presentTypes.add(t));
        } else if (game.system?.documentTypes?.Actor) {
            const sysTypes = Array.isArray(game.system.documentTypes.Actor) 
                ? game.system.documentTypes.Actor 
                : Object.keys(game.system.documentTypes.Actor);
            sysTypes.forEach(t => presentTypes.add(t));
        }

        const actorTypes = Array.from(presentTypes).map(typeKey => {
            let label = typeKey.capitalize();
            if (CONFIG.Actor?.typeLabels?.[typeKey]) {
                label = game.i18n.localize(CONFIG.Actor.typeLabels[typeKey]);
            }
            return {
                type: typeKey,
                label: label,
                selected: this.actorTypeFilter === typeKey
            };
        });
        actorTypes.sort((a, b) => a.label.localeCompare(b.label));

        // 4. Filter Available Actors
        let filteredActors = allActors;
        if (this.actorTypeFilter && this.actorTypeFilter !== "all") {
            filteredActors = filteredActors.filter(a => a.type === this.actorTypeFilter);
        }
        filteredActors.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        // Validate or set default selectedActorUuid
        if (!filteredActors.some(a => a.uuid === this.selectedActorUuid) && filteredActors.length > 0) {
            this.selectedActorUuid = filteredActors[0].uuid;
        } else if (filteredActors.length === 0) {
            this.selectedActorUuid = null;
        }

        const availableActors = filteredActors.map(a => {
            const typeLabel = CONFIG.Actor?.typeLabels?.[a.type] 
                ? game.i18n.localize(CONFIG.Actor.typeLabels[a.type]) 
                : a.type.capitalize();
            return {
                id: a.id,
                uuid: a.uuid,
                name: a.name,
                img: a.img || "icons/svg/mystery-man.svg",
                type: a.type,
                typeLabel: typeLabel,
                selected: this.selectedActorUuid === a.uuid
            };
        });

        return {
            parties,
            selectedParty,
            individuals,
            canAdd,
            canRemove,
            actorTypes,
            isAllSelected: this.actorTypeFilter === "all",
            availableActors,
            selectedActorUuid: this.selectedActorUuid
        };
    }

    // Actions
    static changeTypeFilter(event, target) {
        this.actorTypeFilter = target.value;
        this.render();
    }

    static changeSelectedActor(event, target) {
        this.selectedActorUuid = target.value;
        this.render();
    }

    static async createParty() {
        if (!this.selectedActorUuid) {
            ui.notifications.warn("Please select an Actor from the dropdown to create a party.");
            return;
        }
        const created = await PartyCruncher.createPartyToken(this.selectedActorUuid);
        if (created && created[0]) {
            this.selectedPartyId = created[0].id;
        }
    }

    static async toggleCrunch(event, target) {
        event.stopPropagation();
        const id = target.closest('[data-id]')?.dataset.id || this.selectedPartyId;
        if (id) {
            await PartyCruncher.toggleCrunch(id);
            this.render();
        }
    }

    static async uncrunch(event, target) {
        event.stopPropagation();
        const id = target.closest('[data-id]')?.dataset.id || this.selectedPartyId;
        if (id) {
            await PartyCruncher.uncrunchParty(id);
            this.render();
        }
    }

    static async deleteParty(event, target) {
        event.stopPropagation();
        const id = target.closest('[data-id]')?.dataset.id || this.selectedPartyId;
        if (id) {
            await PartyCruncher.deleteParty(id);
            if (this.selectedPartyId === id) this.selectedPartyId = null;
            this.render();
        }
    }

    static async addTokens() {
        if (!this.selectedPartyId || this.selectedIndividualIds.size === 0) return;
        const idsToAdd = Array.from(this.selectedIndividualIds).filter(id => {
            const ind = PartyCruncher.getIndividuals().find(i => i.id === id);
            return ind && (!ind.inParty || ind.inParty !== this.selectedPartyId);
        });
        if (idsToAdd.length > 0) {
            await PartyCruncher.addTokensToParty(this.selectedPartyId, idsToAdd);
            this.selectedIndividualIds.clear();
            this.render();
        }
    }

    static async removeTokens() {
        if (!this.selectedPartyId || this.selectedIndividualIds.size === 0) return;
        const idsToRemove = Array.from(this.selectedIndividualIds).filter(id => {
            const ind = PartyCruncher.getIndividuals().find(i => i.id === id);
            return ind && ind.inParty === this.selectedPartyId;
        });
        if (idsToRemove.length > 0) {
            await PartyCruncher.removeTokensFromParty(this.selectedPartyId, idsToRemove);
            this.selectedIndividualIds.clear();
            this.render();
        }
    }

    static selectParty(event, target) {
        const id = target.closest('[data-id]')?.dataset.id;
        if (this.selectedPartyId === id) {
            this.selectedPartyId = null;
        } else {
            this.selectedPartyId = id;
        }
        this.render();
    }

    static selectIndividual(event, target) {
        const id = target.closest('[data-id]')?.dataset.id;
        if (this.selectedIndividualIds.has(id)) {
            this.selectedIndividualIds.delete(id);
        } else {
            this.selectedIndividualIds.add(id);
        }
        this.render();
    }
}
