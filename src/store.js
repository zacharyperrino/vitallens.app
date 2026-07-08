// Reactive LocalStorage-backed data store
const STORE_KEY = 'vitallens_data';

const defaultData = {
    onboardingComplete: false,
    profile: {
        name: '',
        age: '',
        gender: '',
        height: '',
        weight: '',
        avatar: '',
        goals: [],
    },
    healthScore: 78,
    meals: [],
    bodyScans: [],
    stoolScans: [],
    scanHistory: [],
    hrReadings: [],
    chatHistory: [],
    stepHistory: [],
    productScans: [],
    healthKit: {
        connected: false,
        lastSync: null,
        goal: 10000,
    },
    labResults: [],
    exerciseLog: [],
    sleepLog: [],
    habits: {
        smoking: false,
        alcohol: 'none',
        caffeine: 'moderate',
        water: 8,
    },
    environmental: {
        airQuality: 'good',
        waterQuality: 'filtered',
        location: '',
    },
    dosha: null,
    doshaAnswers: [],
    insights: [],
    dailyNutrition: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
    },
    weeklyScores: [72, 74, 71, 76, 78, 75, 78],
    streaks: {
        logging: 0,
        exercise: 0,
        sleep: 0,
    },
    strava: {
        clientId: null,
        clientSecret: null,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        athleteId: null,
        athleteName: null,
        athleteAvatar: null,
        lastSync: null,
        activities: null,
    },
    oura: {
        connected: false,
        accessToken: null,
        readiness: [],
        sleep: [],
        activity: [],
        lastSync: null,
    },
};

class Store {
    constructor() {
        this._data = this._load();
        this._listeners = [];
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...defaultData, ...parsed };
            }
        } catch (e) {
            console.warn('Store load error:', e);
        }
        return { ...defaultData };
    }

    _save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('Store save error:', e);
        }
        this._notify();
    }

    _notify() {
        this._listeners.forEach(fn => fn(this._data));
    }

    get(key) {
        return this._data[key];
    }

    set(key, value) {
        this._data[key] = value;
        this._save();
    }

    update(key, updater) {
        this._data[key] = updater(this._data[key]);
        this._save();
    }

    push(key, item) {
        if (!Array.isArray(this._data[key])) this._data[key] = [];
        this._data[key].unshift({ ...item, id: Date.now(), timestamp: new Date().toISOString() });
        this._save();
    }

    subscribe(fn) {
        this._listeners.push(fn);
        return () => {
            this._listeners = this._listeners.filter(l => l !== fn);
        };
    }

    reset() {
        this._data = { ...defaultData };
        this._save();
    }

    getAll() {
        return { ...this._data };
    }
}

export const store = new Store();
