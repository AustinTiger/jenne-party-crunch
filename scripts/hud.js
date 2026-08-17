import { PartyCruncher } from './main.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PartyCrunchHUD extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.selectedPartyId = null;
        this.selectedIndividualIds = new Set();
        
        // Listen to canvas updates to re-render when tokens change
        Hooks.on('createToken', this._onTokenChange.bind(this));
        Hooks.on('updateToken', this._onTokenChange.bind(this));
        Hooks.on('deleteToken', this._onTokenChange.bind(this));
    }

    _onTokenChange() {
        if (this.rendered) {
            this.render();
        }
    }

    static DEFAULT_OPTIONS = {
        id: "jenne-party-crunch-hud",
        title: "Party Crunch Manager",
        window: {
            icon: "fa-solid fa-users-viewfinder",
            resizable: true,
        },
        position: {
            width: 600,
            height: 400
        },
        actions: {
            createParty: PartyCrunchHUD.createParty,
            uncrunch: PartyCrunchHUD.uncrunch,
            addTokens: PartyCrunchHUD.addTokens,
            removeTokens: PartyCrunchHUD.removeTokens,
            selectParty: PartyCrunchHUD.selectParty,
            selectIndividual: PartyCrunchHUD.selectIndividual
        }
    };

    static PARTS = {
        main: {
            template: "modules/jenne-party-crunch/templates/party-hud.hbs"
        }
    };

    async _prepareContext(options) {
        const parties = PartyCruncher.getCrunchedTokens().map(t => ({
            id: t.id,
            name: t.name,
            img: t.texture?.src || t.document?.texture?.src,
            selected: this.selectedPartyId === t.id
        }));

        const individualsData = PartyCruncher.getIndividuals();
        const individuals = individualsData.map(i => ({
            ...i,
            selected: this.selectedIndividualIds.has(i.id),
            inSelectedParty: i.inParty === this.selectedPartyId
        }));

        const canAdd = this.selectedPartyId && this.selectedIndividualIds.size > 0 && Array.from(this.selectedIndividualIds).some(id => {
            const ind = individuals.find(i => i.id === id);
            return ind && !ind.inParty;
        });
        
        const canRemove = this.selectedPartyId && this.selectedIndividualIds.size > 0 && Array.from(this.selectedIndividualIds).some(id => {
            const ind = individuals.find(i => i.id === id);
            return ind && ind.inParty === this.selectedPartyId;
        });

        return {
            parties,
            individuals,
            canAdd,
            canRemove
        };
    }

    // actions
    static async createParty() {
        await PartyCruncher.createPartyToken();
        // The hook will auto-render us when the token is created.
    }

    static async uncrunch(event, target) {
        // Prevent click from propagating to selectParty
        event.stopPropagation();
        
        const id = target.closest('[data-id]')?.dataset.id;
        if (id) {
            await PartyCruncher.uncrunchParty(id);
            if (this.selectedPartyId === id) this.selectedPartyId = null;
        }
    }

    static async addTokens() {
        if (!this.selectedPartyId || this.selectedIndividualIds.size === 0) return;
        const idsToAdd = Array.from(this.selectedIndividualIds).filter(id => {
            const ind = PartyCruncher.getIndividuals().find(i => i.id === id);
            return ind && !ind.inParty;
        });
        if (idsToAdd.length > 0) {
            await PartyCruncher.addTokensToParty(this.selectedPartyId, idsToAdd);
            this.selectedIndividualIds.clear();
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
