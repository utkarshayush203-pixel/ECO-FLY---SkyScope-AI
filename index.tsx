import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// Access Leaflet from window as it is loaded via CDN
const L = (window as any).L;

// --- GLOBAL DATA CONSTANTS ---

const AIRCRAFT_TYPES = {
    COMM: { id: 'COMM', label: 'Commercial', icon: 'fa-plane', baseSpeed: 480, baseAlt: 35000 },
    CARGO: { id: 'CARGO', label: 'Cargo / Heavy', icon: 'fa-truck-plane', baseSpeed: 460, baseAlt: 33000 },
    MIL: { id: 'MIL', label: 'Military / Gov', icon: 'fa-jet-fighter', baseSpeed: 600, baseAlt: 40000, restricted: true },
    HELI: { id: 'HELI', label: 'Helicopter', icon: 'fa-helicopter', baseSpeed: 120, baseAlt: 3000 },
    EVTOL: { id: 'EVTOL', label: 'Air Taxi', icon: 'fa-paper-plane', baseSpeed: 100, baseAlt: 1500 },
    GA: { id: 'GA', label: 'General Aviation', icon: 'fa-plane-propeller', baseSpeed: 140, baseAlt: 8000 }
};

const AIRLINES = [
    // Americas
    { code: 'AAL', name: 'American Airlines', country: 'US', color: '#c2c2c2' },
    { code: 'UAL', name: 'United Airlines', country: 'US', color: '#005DAA' },
    { code: 'DAL', name: 'Delta Air Lines', country: 'US', color: '#E31837' },
    { code: 'SWA', name: 'Southwest', country: 'US', color: '#F9B612' },
    // Europe
    { code: 'BAW', name: 'British Airways', country: 'GB', color: '#002E70' },
    { code: 'DLH', name: 'Lufthansa', country: 'DE', color: '#FFAB00' },
    { code: 'AFR', name: 'Air France', country: 'FR', color: '#002157' },
    { code: 'KLM', name: 'KLM', country: 'NL', color: '#00A1DE' },
    { code: 'RYR', name: 'Ryanair', country: 'IE', color: '#073590' },
    // Middle East & Africa
    { code: 'UAE', name: 'Emirates', country: 'AE', color: '#FF0000' },
    { code: 'QTR', name: 'Qatar Airways', country: 'QA', color: '#5C0632' },
    // Asia Pacific
    { code: 'SIA', name: 'Singapore Airlines', country: 'SG', color: '#FDB913' },
    { code: 'CPA', name: 'Cathay Pacific', country: 'HK', color: '#006B6E' },
    { code: 'ANA', name: 'All Nippon Airways', country: 'JP', color: '#1046A8' },
    { code: 'JAL', name: 'Japan Airlines', country: 'JP', color: '#CC0000' },
    { code: 'QFA', name: 'Qantas', country: 'AU', color: '#E0001B' },
    // Cargo
    { code: 'FDX', name: 'FedEx Express', country: 'US', color: '#4D148C' },
    { code: 'UPS', name: 'UPS Airlines', country: 'US', color: '#FFB500' },
    // Military
    { code: 'RCH', name: 'US Air Force', country: 'US', color: '#475569' },
    { code: 'RRR', name: 'Royal Air Force', country: 'GB', color: '#5B8FA6' },
    { code: 'NATO', name: 'NATO', country: 'INT', color: '#1e3a8a' },
    // Eco
    { code: 'ECO', name: 'ECO FLY Zero', country: 'INT', color: '#10b981' }
];

const AIRPORTS = [
    { iata: 'LHR', lat: 51.4700, lng: -0.4543, city: 'London' },
    { iata: 'JFK', lat: 40.6413, lng: -73.7781, city: 'New York' },
    { iata: 'DXB', lat: 25.2532, lng: 55.3657, city: 'Dubai' },
    { iata: 'HND', lat: 35.5494, lng: 139.7798, city: 'Tokyo' },
    { iata: 'LAX', lat: 33.9416, lng: -118.4085, city: 'Los Angeles' },
    { iata: 'CDG', lat: 49.0097, lng: 2.5479, city: 'Paris' },
    { iata: 'AMS', lat: 52.3105, lng: 4.7683, city: 'Amsterdam' },
    { iata: 'SIN', lat: 1.3644, lng: 103.9915, city: 'Singapore' },
    { iata: 'SYD', lat: -33.9399, lng: 151.1753, city: 'Sydney' },
    { iata: 'FRA', lat: 50.0379, lng: 8.5622, city: 'Frankfurt' },
    { iata: 'DFW', lat: 32.8998, lng: -97.0403, city: 'Dallas' },
    { iata: 'HKG', lat: 22.3080, lng: 113.9185, city: 'Hong Kong' },
    { iata: 'IST', lat: 41.2753, lng: 28.7519, city: 'Istanbul' },
    { iata: 'MIA', lat: 25.7959, lng: -80.2870, city: 'Miami' }
];

// --- MATH / PHYSICS HELPERS ---

const interpolate = (p1, p2, f) => p1 + (p2 - p1) * f;

// Haversine Distance in km
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

// CO2 Calculator (kg) based on distance (km) and type
const calculateCO2 = (distance, type) => {
    // Approximate CO2 emissions in kg per km
    const rates = {
        'COMM': 12.5,   // Standard commercial jet
        'CARGO': 16.0,  // Heavy freighter
        'MIL': 22.0,    // High performance jet / heavy transport
        'HELI': 4.5,    // Rotary wing
        'EVTOL': 0.05,  // Mostly electric, small residual for hybrid/generation
        'GA': 1.2       // Small propeller
    };
    const rate = rates[type.id] || 10.0;
    return distance * rate;
};

// Data Generator
const generateWorldTraffic = (count) => {
    const flights = [];
    let idCounter = 1000;

    for (let i = 0; i < count; i++) {
        const rand = Math.random();
        let typeKey = 'COMM';
        if (rand > 0.95) typeKey = 'MIL';
        else if (rand > 0.90) typeKey = 'CARGO';
        else if (rand > 0.88) typeKey = 'HELI';
        else if (rand > 0.86) typeKey = 'EVTOL';
        
        const type = AIRCRAFT_TYPES[typeKey];
        
        let airline;
        if (typeKey === 'MIL') airline = AIRLINES.find(a => ['RCH','RRR','NATO'].includes(a.code)) || AIRLINES[18];
        else if (typeKey === 'CARGO') airline = AIRLINES.find(a => ['FDX','UPS'].includes(a.code)) || AIRLINES[16];
        else if (typeKey === 'HELI' || typeKey === 'EVTOL') airline = { code: 'PVT', name: 'Private Ops', country: '', color: '#94a3b8' };
        else airline = AIRLINES[Math.floor(Math.random() * 16)];

        const dep = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
        let arr = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];
        while (dep.iata === arr.iata) arr = AIRPORTS[Math.floor(Math.random() * AIRPORTS.length)];

        const progress = Math.random();
        const lat = interpolate(dep.lat, arr.lat, progress);
        const lng = interpolate(dep.lng, arr.lng, progress);
        
        const dy = arr.lat - dep.lat;
        const dx = arr.lng - dep.lng;
        let heading = Math.atan2(dx, dy) * (180 / Math.PI);
        if (heading < 0) heading += 360;

        const alt = type.baseAlt + Math.floor(Math.random() * 4000 - 2000);
        const spd = type.baseSpeed + Math.floor(Math.random() * 60 - 30);
        
        const models = ['Boeing 737', 'Airbus A320', 'Boeing 787', 'Airbus A350', 'Boeing 777'];
        let model = models[Math.floor(Math.random() * models.length)];
        if(typeKey === 'MIL') model = 'C-17 Globemaster';
        
        flights.push({
            id: (idCounter++).toString(16).toUpperCase(),
            callsign: `${airline.code}${Math.floor(Math.random() * 9000) + 100}`,
            airline, type, model,
            lat, lng, heading,
            alt, spd,
            mach: (spd / 661).toFixed(2),
            squawk: typeKey === 'MIL' ? '0000' : Math.floor(Math.random() * 7000 + 1000),
            vSpd: Math.floor(Math.random() * 2000 - 1000),
            dep, arr,
            reg: `${airline.country || 'N'}-${Math.random().toString(36).substring(7).toUpperCase()}`,
            co2Factor: (typeKey === 'MIL' || typeKey === 'CARGO') ? 1.5 : 0.8,
            history: [] // Init history for trails
        });
    }
    return flights;
};

// --- COMPONENTS ---

const IconFactory = {
    create: (flight, isSelected) => {
        const isMil = flight.type.restricted;
        const isEco = flight.airline.code === 'ECO';
        
        const size = isSelected ? 40 : 26;
        const color = isMil ? '#ef4444' : (isEco ? '#10b981' : flight.airline.color);
        
        // Shadow calculation (Pseudo 3D)
        const shadowOffset = Math.max(2, flight.alt / 2000); 
        
        const html = `
            <div class="flight-icon-container">
                <div class="flight-shadow" style="transform: translate(${shadowOffset}px, ${shadowOffset}px) rotate(${flight.heading}deg); font-size: ${size}px;">
                     <i class="fa-solid ${flight.type.icon}"></i>
                </div>
                <div class="flight-icon-wrapper" style="transform: rotate(${flight.heading}deg);">
                    <i class="fa-solid ${flight.type.icon}" style="
                        font-size: ${size}px; 
                        color: ${color}; 
                        filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
                        display: block;
                    "></i>
                </div>
                ${isSelected ? `<div style="margin-top:20px; text-align:center; background:rgba(0,0,0,0.8); color:#fff; font-size:10px; padding:2px 4px; border-radius:3px; font-family:monospace; white-space:nowrap; position:absolute; top:${size}px; left:50%; transform:translateX(-50%); border: 1px solid ${color}; z-index:20;">${flight.callsign}</div>` : ''}
            </div>
        `;

        return L.divIcon({
            className: '',
            html: html,
            iconSize: [size * 2, size * 2],
            iconAnchor: [size, size]
        });
    }
};

const CockpitView = ({ flight, onClose }) => {
    if (!flight) return null;
    return (
        <div className="fixed inset-0 z-[2000] bg-black text-green-500 font-mono animate-fade-in flex flex-col">
            <div className="absolute inset-0 bg-gradient-to-b from-sky-900 to-slate-900 opacity-50"></div>
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-black perspective-container overflow-hidden border-t-2 border-green-500">
                <div className="w-full h-full synth-grid"></div>
            </div>
            <div className="absolute inset-0 p-8 flex flex-col justify-between pointer-events-none">
                <div className="flex justify-between items-start">
                    <div className="bg-black/40 border border-green-500/30 p-2">
                        <div className="text-4xl font-bold">{Math.round(flight.spd)} <span className="text-sm">KTS</span></div>
                        <div className="text-xs">AIRSPEED TRUE</div>
                    </div>
                    <div className="text-xl bg-black/60 px-4 py-1 border border-green-500">{Math.round(flight.heading)}° MAG</div>
                    <div className="bg-black/40 border border-green-500/30 p-2 text-right">
                        <div className="text-4xl font-bold">{flight.alt.toLocaleString()} <span className="text-sm">FT</span></div>
                        <div className="text-xs">ALTITUDE BARO</div>
                    </div>
                </div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-64 border border-green-500/20 rounded flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-green-500 rounded-full"></div>
                </div>
            </div>
            <button onClick={onClose} className="absolute top-4 right-4 z-[2010] bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold pointer-events-auto">EJECT / CLOSE</button>
        </div>
    );
};

const AirportBoard = ({ airport, onClose }) => {
    const deps = Array.from({length: 8}).map((_, i) => ({
        time: new Date(Date.now() + i * 15 * 60000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
        flight: `${AIRLINES[Math.floor(Math.random()*AIRLINES.length)].code}${Math.floor(Math.random()*1000)}`,
        dest: AIRPORTS[Math.floor(Math.random()*AIRPORTS.length)].city,
        status: Math.random() > 0.8 ? 'DELAYED' : 'ON TIME'
    }));

    return (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono animate-fade-in">
            <div className="bg-slate-900 border border-hud-cyan w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl rounded-lg overflow-hidden">
                <div className="p-4 bg-slate-800 border-b border-hud-cyan/30 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{airport.iata} DEPARTURE BOARD</h2>
                        <div className="text-hud-cyan">{airport.city.toUpperCase()} INTL</div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><i className="fa-solid fa-xmark fa-lg"></i></button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-slate-500 border-b border-slate-700">
                            <tr><th className="py-2">TIME</th><th>FLIGHT</th><th>DESTINATION</th><th>STATUS</th></tr>
                        </thead>
                        <tbody className="text-slate-200">
                            {deps.map((d, i) => (
                                <tr key={i} className="border-b border-slate-800">
                                    <td className="py-3 text-hud-cyan">{d.time}</td>
                                    <td className="font-bold">{d.flight}</td>
                                    <td>{d.dest.toUpperCase()}</td>
                                    <td className={d.status === 'DELAYED' ? 'text-red-500 blink' : 'text-green-500'}>{d.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

const FlightPanel = ({ flight, onClose, setCockpit, onAnalyze, analysis }) => {
    if (!flight) return null;
    
    // Real-time physics calculation for UI
    const distTraveled = getDistance(flight.dep.lat, flight.dep.lng, flight.lat, flight.lng);
    const emitted = calculateCO2(distTraveled, flight.type);
    
    // Format for display (Dynamic KG/TONS)
    let co2Display;
    if (emitted >= 1000) {
        co2Display = `${(emitted / 1000).toFixed(2)} TONS`;
    } else {
        co2Display = `${Math.round(emitted)} KG`;
    }

    return (
        <div className="fixed top-0 left-0 bottom-0 w-full md:w-[400px] glass-panel z-[1500] flex flex-col transform transition-transform animate-fade-in font-mono text-slate-200">
            <div className="relative h-40 bg-slate-900 overflow-hidden border-b border-hud-cyan/20 group">
                <img src={`https://placehold.co/600x400/1e293b/06b6d4?text=${flight.model.replace(/ /g, '+')}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4">
                    <h2 className="text-4xl font-bold text-white font-sans tracking-wide drop-shadow-md">{flight.callsign}</h2>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: flight.airline.color}}></div>
                        <div className="text-sm text-hud-cyan font-bold">{flight.airline.name}</div>
                    </div>
                </div>
                <button onClick={onClose} className="absolute top-4 right-4 bg-black/50 hover:bg-red-500/80 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors"><i className="fa-solid fa-times"></i></button>
            </div>
            <div className="flex p-2 gap-2 border-b border-hud-cyan/20 bg-slate-900/50">
                <button onClick={() => setCockpit(true)} className="flex-1 bg-hud-cyan/10 hover:bg-hud-cyan/30 border border-hud-cyan/50 text-hud-cyan py-2 rounded text-xs font-bold"><i className="fa-solid fa-vr-cardboard mr-2"></i>3D COCKPIT</button>
                <button className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 py-2 rounded text-xs font-bold"><i className="fa-solid fa-share-nodes mr-2"></i>SHARE</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="flex justify-between items-center text-center">
                    <div><div className="text-3xl font-bold text-white">{flight.dep.iata}</div><div className="text-[10px] text-slate-400">{flight.dep.city.toUpperCase()}</div></div>
                    <div className="flex-1 px-4 flex flex-col items-center"><div className="text-xs text-emerald-400 font-bold mb-1">IN FLIGHT</div><div className="w-full h-[2px] bg-slate-600 relative"><div className="absolute top-0 left-0 h-full bg-emerald-400" style={{width: '65%'}}></div><i className="fa-solid fa-plane absolute top-1/2 -translate-y-1/2 text-emerald-400 text-xs" style={{left: '65%'}}></i></div></div>
                    <div><div className="text-3xl font-bold text-white">{flight.arr.iata}</div><div className="text-[10px] text-slate-400">{flight.arr.city.toUpperCase()}</div></div>
                </div>

                <div className="bg-slate-800/50 p-3 rounded border border-white/5 flex justify-between items-center">
                    <div>
                        <div className="text-[10px] text-slate-400">AIRCRAFT MODEL</div>
                        <div className="text-lg font-bold text-white">{flight.model}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-slate-400">TYPE</div>
                        <div className="text-sm font-bold text-hud-cyan">{flight.type.label.toUpperCase()}</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/50 p-3 rounded border border-white/5"><div className="text-[10px] text-slate-400">ALTITUDE (FT)</div><div className="text-2xl font-bold text-white">{flight.alt.toLocaleString()}</div></div>
                    <div className="bg-slate-800/50 p-3 rounded border border-white/5"><div className="text-[10px] text-slate-400">SPEED (KTS)</div><div className="text-2xl font-bold text-white">{flight.spd}</div></div>
                    <div className="bg-slate-800/50 p-3 rounded border border-white/5"><div className="text-[10px] text-slate-400">V. SPEED</div><div className="text-2xl font-bold text-white">{flight.vSpd}</div></div>
                    <div className="bg-slate-800/50 p-3 rounded border border-white/5"><div className="text-[10px] text-slate-400">SQUAWK</div><div className="text-2xl font-bold text-white">{flight.squawk}</div></div>
                    
                    {/* NEW: CO2 Emissions Cell */}
                    <div className="col-span-2 bg-slate-800/50 p-3 rounded border border-white/5 flex justify-between items-center">
                        <div>
                            <div className="text-[10px] text-slate-400">CO2 EMITTED (REAL-TIME)</div>
                            <div className="text-xl font-bold text-orange-400">{co2Display}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-slate-400">DIST TRAVELED</div>
                            <div className="text-sm font-bold text-white">{Math.round(distTraveled).toLocaleString()} KM</div>
                        </div>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-emerald-500/30 rounded p-4 relative overflow-hidden">
                     <div className="absolute -right-4 -top-4 text-emerald-500/10 text-9xl"><i className="fa-solid fa-leaf"></i></div>
                     <h3 className="text-sm font-bold text-emerald-400 mb-3 relative z-10">ECO-MIND AI ROUTE OPTIMIZATION</h3>
                     {!analysis ? (
                        <button onClick={() => onAnalyze(flight)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded shadow-lg shadow-emerald-900/50 transition-all font-bold text-xs relative z-10"><i className="fa-solid fa-microchip mr-2"></i>ANALYZE FOOTPRINT</button>
                    ) : (
                        <div className="space-y-3 relative z-10 animate-fade-in">
                            <div className="flex justify-between items-end"><div className="text-xs text-slate-400">ESTIMATED TOTAL CO2</div><div className="text-2xl font-bold text-white">{analysis.current.toLocaleString()} <span className="text-xs text-slate-500">KG</span></div></div>
                            <div className="bg-emerald-900/30 rounded p-2 border border-emerald-500/50"><div className="flex justify-between items-center mb-1"><div className="text-xs text-emerald-300 font-bold">OPTIMIZED ROUTE FOUND</div><div className="text-xs bg-emerald-500 text-black px-1 rounded font-bold">-{analysis.percent}%</div></div><div className="text-xs text-slate-300">Potential saving of <span className="text-white font-bold">{analysis.saved.toLocaleString()} KG</span> CO2.</div></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const FilterPanel = ({ filters, setFilters, onClose }) => {
    const types = ['ALL', 'COMM', 'MIL', 'CARGO', 'HELI', 'EVTOL'];
    return (
        <div className="fixed top-20 right-4 w-80 glass-panel z-[1400] p-4 text-slate-200 font-mono animate-fade-in rounded-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-hud-cyan/30 pb-2">
                <h3 className="font-bold text-hud-cyan"><i className="fa-solid fa-filter mr-2"></i>RADAR CONTROL</h3>
                <button onClick={onClose}><i className="fa-solid fa-times"></i></button>
            </div>
            <div className="space-y-5 text-xs">
                <div>
                    <label className="block text-slate-400 mb-1 font-bold">TRAFFIC CLASS</label>
                    <div className="grid grid-cols-3 gap-2">
                        {types.map(type => (
                            <button 
                                key={type} 
                                onClick={() => setFilters({...filters, type})} 
                                className={`py-1 border rounded transition-colors ${filters.type === type ? 'bg-hud-cyan text-black border-hud-cyan font-bold' : 'border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200'}`}
                            >
                                {type === 'ALL' ? 'ALL' : type}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-slate-400 mb-1 font-bold">AIRLINE OPERATOR</label>
                    <select 
                        value={filters.airline} 
                        onChange={e => setFilters({...filters, airline: e.target.value})} 
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 focus:border-hud-cyan outline-none text-slate-200"
                    >
                        <option value="ALL">ALL OPERATORS</option>
                        {AIRLINES.sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                            <option key={a.code} value={a.code}>{a.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-slate-400 font-bold">MIN ALTITUDE</label>
                        <span className="text-hud-cyan font-bold">{filters.minAlt.toLocaleString()} FT</span>
                    </div>
                    <input 
                        type="range" 
                        min="0" 
                        max="50000" 
                        step="1000" 
                        value={filters.minAlt} 
                        onChange={e => setFilters({...filters, minAlt: parseInt(e.target.value)})} 
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-hud-cyan" 
                    />
                </div>
            </div>
            <button 
                onClick={() => setFilters({ type: 'ALL', airline: 'ALL', minAlt: 0, minSpd: 0 })} 
                className="mt-6 w-full border border-red-500/50 text-red-400 py-2 rounded hover:bg-red-900/20 transition-colors text-xs font-bold"
            >
                RESET SYSTEM
            </button>
        </div>
    );
};

const App = () => {
    const [flights, setFlights] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({ type: 'ALL', airline: 'ALL', minAlt: 0, minSpd: 0 });
    const [mapStyle, setMapStyle] = useState('dark');
    const [cockpitMode, setCockpitMode] = useState(false);
    const [analysis, setAnalysis] = useState(null);
    const [selectedAirport, setSelectedAirport] = useState(null);
    const [weatherMode, setWeatherMode] = useState(false);
    
    const mapRef = useRef(null);
    const mapContainerRef = useRef(null);
    const markersRef = useRef({});
    const trailsRef = useRef({}); // For selected flight eco lines
    const allTrailsRef = useRef({}); // For all traffic trails
    const tileLayerRef = useRef(null);
    const canvasRendererRef = useRef(null);

    // 1. Initialize Map
    useEffect(() => {
        if (mapRef.current) return;
        
        // IMPORTANT: Initialize on the container ref, not 'root' to avoid conflict with React
        mapRef.current = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: false,
            center: [20, 10], 
            zoom: 3,
            minZoom: 2,
            worldCopyJump: true
        });

        // Init Canvas Renderer for high-performance trails
        canvasRendererRef.current = L.canvas({ padding: 0.5 });
        canvasRendererRef.current.addTo(mapRef.current);

        // Add Airports
        AIRPORTS.forEach(apt => {
            L.circleMarker([apt.lat, apt.lng], {
                radius: 3, color: '#06b6d4', fillOpacity: 0.8
            }).addTo(mapRef.current).on('click', () => setSelectedAirport(apt));
        });

        // Initial Traffic
        setFlights(generateWorldTraffic(500));
    }, []);

    // 2. Map Layer Switching Logic
    useEffect(() => {
        if (!mapRef.current) return;
        
        // Remove existing layer
        if (tileLayerRef.current) {
            // Check if it's a layer group or single layer
            if (tileLayerRef.current.clearLayers) tileLayerRef.current.clearLayers();
            mapRef.current.removeLayer(tileLayerRef.current);
        }

        if (mapStyle === 'dark') {
            // Dark Matter (Radar Style)
            const layer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
            layer.addTo(mapRef.current);
            tileLayerRef.current = layer;
            mapContainerRef.current.classList.remove('map-tiles-sat');
            mapContainerRef.current.classList.add('map-tiles-dark');
        } else {
            // Satellite + Labels
            const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
            const labels = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
            const group = L.layerGroup([sat, labels]);
            group.addTo(mapRef.current);
            tileLayerRef.current = group;
            mapContainerRef.current.classList.remove('map-tiles-dark');
            mapContainerRef.current.classList.add('map-tiles-sat');
        }
    }, [mapStyle]);

    // 3. Simulation Loop
    useEffect(() => {
        const interval = setInterval(() => {
            setFlights(prev => prev.map(f => {
                const rad = f.heading * (Math.PI / 180);
                const dist = (f.spd / 3600) * 0.2; 
                let newLat = f.lat + Math.cos(rad) * dist;
                let newLng = f.lng + Math.sin(rad) * dist;
                if (newLat > 85 || newLat < -85) f.heading = (f.heading + 180) % 360;
                if (newLng > 180) newLng -= 360;
                if (newLng < -180) newLng += 360;

                // Update History Trail (Rolling window of ~25 points)
                const history = f.history ? [...f.history] : [];
                history.push([newLat, newLng]);
                if (history.length > 25) history.shift();

                return { ...f, lat: newLat, lng: newLng, history };
            }));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // 4. Filtering
    const filteredFlights = useMemo(() => {
        return flights.filter(f => {
            // Search
            if (searchQuery) {
                const q = searchQuery.toUpperCase().trim();
                if (q.length > 0) {
                        const matchesCallsign = f.callsign.includes(q);
                        const matchesAirline = f.airline.name.toUpperCase().includes(q);
                        const matchesReg = f.reg.includes(q);
                        const matchesModel = f.model.toUpperCase().includes(q);
                        
                        // Airport matches (IATA or City)
                        const matchesDep = f.dep.iata.includes(q) || f.dep.city.toUpperCase().includes(q);
                        const matchesArr = f.arr.iata.includes(q) || f.arr.city.toUpperCase().includes(q);
                        
                        if (!matchesCallsign && !matchesAirline && !matchesReg && !matchesModel && !matchesDep && !matchesArr) {
                            return false;
                        }
                }
            }
            
            // Filter by Type
            if (filters.type !== 'ALL' && f.type.id !== filters.type) return false;
            
            // Filter by Airline
            if (filters.airline !== 'ALL' && f.airline.code !== filters.airline) return false;
            
            // Filter by Altitude
            if (f.alt < filters.minAlt) return false;
            
            return true;
        });
    }, [flights, filters, searchQuery]);

    // 5. Marker & Traffic Trail Updates
    useEffect(() => {
        if (!mapRef.current) return;

        // Remove stale markers and trails
        const validIds = new Set(filteredFlights.map(f => f.id));
        Object.keys(markersRef.current).forEach(id => {
            if (!validIds.has(id)) {
                mapRef.current.removeLayer(markersRef.current[id]);
                delete markersRef.current[id];
            }
        });
        Object.keys(allTrailsRef.current).forEach(id => {
            if (!validIds.has(id)) {
                mapRef.current.removeLayer(allTrailsRef.current[id]);
                delete allTrailsRef.current[id];
            }
        });

        // Update markers and trails
        filteredFlights.forEach(f => {
            const isSelected = f.id === selectedId;
            
            // 1. Update Marker
            if (markersRef.current[f.id]) {
                const marker = markersRef.current[f.id];
                marker.setLatLng([f.lat, f.lng]);
                // Only update icon on state change to improve perf
                if (marker._isSelected !== isSelected) {
                    marker.setIcon(IconFactory.create(f, isSelected));
                    marker.setZIndexOffset(isSelected ? 1000 : 0);
                    marker._isSelected = isSelected;
                }
            } else {
                const marker = L.marker([f.lat, f.lng], {
                    icon: IconFactory.create(f, isSelected)
                }).addTo(mapRef.current);
                marker._isSelected = isSelected;
                marker.on('click', () => { setSelectedId(f.id); setAnalysis(null); });
                markersRef.current[f.id] = marker;
            }

            // 2. Update Dynamic Trail (History)
            // We use canvasRenderer for performance with 500+ lines
            if (allTrailsRef.current[f.id]) {
                allTrailsRef.current[f.id].setLatLngs(f.history);
            } else {
                // Create trail if it doesn't exist
                const trail = L.polyline(f.history, {
                    color: f.airline.color,
                    weight: 2,
                    opacity: 0.3, // "Faded" look
                    renderer: canvasRendererRef.current, // Use canvas renderer
                    interactive: false
                }).addTo(mapRef.current);
                allTrailsRef.current[f.id] = trail;
            }
        });
    }, [filteredFlights, selectedId]);

    // 6. Selected Flight Path Logic (Projected Routes)
    useEffect(() => {
        if (!mapRef.current) return;
        
        const f = flights.find(fl => fl.id === selectedId);

        // Setup or update Standard Line
        if (f) {
            const currentPath = [[f.dep.lat, f.dep.lng], [f.lat, f.lng], [f.arr.lat, f.arr.lng]];
            if (!trailsRef.current.line) {
                trailsRef.current.line = L.polyline(currentPath, { color: '#f59e0b', weight: 2, dashArray: '5, 10' }).addTo(mapRef.current);
            } else {
                trailsRef.current.line.setLatLngs(currentPath);
            }

            // Eco Line (Displayed when analysis exists)
            if (analysis) {
                    const offset = parseInt(f.id, 16) % 10 - 5; 
                    const midLat = (f.dep.lat + f.arr.lat) / 2 + (offset * 0.5);
                    const midLng = (f.dep.lng + f.arr.lng) / 2 + (offset * 0.5);
                    
                    const ecoPath = [[f.dep.lat, f.dep.lng], [midLat, midLng], [f.arr.lat, f.arr.lng]];
                    
                    if (!trailsRef.current.ecoLine) {
                        trailsRef.current.ecoLine = L.polyline(ecoPath, { color: '#10b981', weight: 3, opacity: 0.8 }).addTo(mapRef.current);
                    } else {
                        trailsRef.current.ecoLine.setLatLngs(ecoPath);
                    }
            } else {
                if (trailsRef.current.ecoLine) {
                    mapRef.current.removeLayer(trailsRef.current.ecoLine);
                    trailsRef.current.ecoLine = null;
                }
            }

        } else {
            // Cleanup if no flight selected
            if (trailsRef.current.line) {
                mapRef.current.removeLayer(trailsRef.current.line);
                trailsRef.current.line = null;
            }
            if (trailsRef.current.ecoLine) {
                mapRef.current.removeLayer(trailsRef.current.ecoLine);
                trailsRef.current.ecoLine = null;
            }
        }
    }, [flights, selectedId, analysis]);

    const handleAnalyze = (flight) => {
        // Determine Total Route Distance and Current CO2 projection
        const totalDist = getDistance(flight.dep.lat, flight.dep.lng, flight.arr.lat, flight.arr.lng);
        const currentTotal = calculateCO2(totalDist, flight.type);
        
        setTimeout(() => {
            const percent = Math.floor(Math.random() * 12 + 8); // 8-20% saving
            setAnalysis({
                current: Math.round(currentTotal),
                percent,
                saved: Math.round(currentTotal * (percent/100))
            });
        }, 1500);
    };

    const selectedFlight = flights.find(f => f.id === selectedId);

    return (
        <div className="relative w-full h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
            {/* Dedicated Map Container */}
            <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-black"></div>
            
            {/* UI Header */}
            <div className="absolute top-0 left-0 right-0 z-[1200] p-4 pointer-events-none flex flex-col md:flex-row justify-between items-start gap-4">
                <div className="pointer-events-auto flex items-center gap-4 glass-panel px-4 py-2 rounded-full relative z-[1201]" onClick={(e) => e.stopPropagation()}>
                    <h1 className="text-2xl font-bold tracking-tighter text-white"><span className="text-hud-cyan">ECO</span> FLY</h1>
                    <div className="h-6 w-[1px] bg-white/20"></div>
                    <div className="flex items-center text-slate-400 bg-slate-900/50 rounded-full px-3 py-1 border border-slate-700">
                        <i className="fa-solid fa-search mr-2"></i>
                        <input 
                            type="text" 
                            placeholder="SEARCH FLIGHT, REG, AIRPORT..." 
                            className="bg-transparent border-none outline-none text-xs w-56 text-white placeholder-slate-500 uppercase font-mono" 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                            onMouseDown={e => e.stopPropagation()}
                            onKeyDown={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                </div>

                <div className="pointer-events-auto flex gap-2">
                    <button onClick={() => setWeatherMode(!weatherMode)} className={`glass-panel w-10 h-10 rounded-full flex items-center justify-center transition-colors ${weatherMode ? 'text-purple-400 border-purple-400' : ''}`} title="Precipitation Radar"><i className="fa-solid fa-cloud-showers-heavy"></i></button>
                    <button onClick={() => setMapStyle(mapStyle === 'dark' ? 'sat' : 'dark')} className="glass-panel w-10 h-10 rounded-full flex items-center justify-center hover:text-hud-cyan transition-colors" title="Toggle Map Layer"><i className={`fa-solid ${mapStyle === 'dark' ? 'fa-satellite' : 'fa-map'}`}></i></button>
                    <button onClick={() => setShowFilters(!showFilters)} className={`glass-panel w-10 h-10 rounded-full flex items-center justify-center transition-colors ${showFilters ? 'text-hud-cyan border-hud-cyan' : ''}`} title="Filters"><i className="fa-solid fa-sliders"></i></button>
                    <div className="glass-panel px-4 h-10 rounded-full flex items-center text-xs font-mono font-bold text-hud-cyan">LIVE: {filteredFlights.length}</div>
                </div>
            </div>

            {showFilters && <FilterPanel filters={filters} setFilters={setFilters} onClose={() => setShowFilters(false)} />}
            <FlightPanel flight={selectedFlight} onClose={() => setSelectedId(null)} setCockpit={setCockpitMode} onAnalyze={handleAnalyze} analysis={analysis} />
            {selectedAirport && <AirportBoard airport={selectedAirport} onClose={() => setSelectedAirport(null)} />}
            {cockpitMode && <CockpitView flight={selectedFlight} onClose={() => setCockpitMode(false)} />}

            <div className="radar-sweep"></div>
            {weatherMode && <div className="absolute inset-0 pointer-events-none z-[500] bg-[url('https://media.giphy.com/media/t7Qb8655Z1oHF4qCxr/giphy.gif')] opacity-10 bg-cover mix-blend-screen"></div>}
        </div>
    );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
