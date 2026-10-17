// SUPABASE CLIENT CONFIGURATION
const SUPABASE_URL = "https://rsaxgzrktakwfhjaetag.supabase.co";
const SUPABASE_KEY = "sb_publishable_0FKrgpfzuZwYTZUZMETAqw_432uuQ3p";
let supabaseClient = null;
let realtimeChannel = null;

let currentRoomCode = null;
let myName = localStorage.getItem('mafia_username') || 'Abdullah';
let myAvatar = localStorage.getItem('mafia_avatar') || '👑';
let coins = parseInt(localStorage.getItem('mafia_coins')) || 10500;
let gems = parseInt(localStorage.getItem('mafia_gems')) || 250;
let playerLevel = parseInt(localStorage.getItem('mafia_level')) || 1;

let gameState = {
    roomCode: "", maxPlayers: 8, status: "waiting", phase: "night",
    winner: null, hostName: "", players: [],
    nightActions: { mafiaTarget: null, doctorTarget: null, policeTarget: null },
    votes: {}, chatMessages: [], mafiaChatMessages: [], lastNightResult: "Game started."
};

const ACHIEVEMENTS_DEFINITIONS = [
    { id: 'mafia1', name: 'First Blood', desc: 'Win 1 game as Mafia', target: 1, key: 'mafiaWins' },
    { id: 'mafia10', name: 'Silent Assassin', desc: 'Win 10 games as Mafia', target: 10, key: 'mafiaWins' },
    { id: 'mafia50', name: 'Caporegime Godfather', desc: 'Win 50 games as Mafia', target: 50, key: 'mafiaWins', title: 'Godfather' },
    { id: 'doc1', name: 'First Aid Medic', desc: 'Heal 1 target successfully', target: 1, key: 'docSaves' },
    { id: 'doc25', name: 'Chief Surgeon', desc: 'Heal 25 targets successfully', target: 25, key: 'docSaves', title: 'Chief Surgeon' },
    { id: 'police1', name: 'Rookie Detective', desc: 'Inspect 5 player roles', target: 5, key: 'policeChecks' },
    { id: 'police25', name: 'Master Sleuth Sheriff', desc: 'Inspect 25 player roles', target: 25, key: 'policeChecks', title: 'Sheriff' },
    { id: 'total10', name: 'Vocal Villager', desc: 'Play 10 total games', target: 10, key: 'totalGames' },
    { id: 'total100', name: 'Grand Master Orator', desc: 'Play 100 total games', target: 100, key: 'totalGames', title: 'Grand Orator' }
];

window.addEventListener('DOMContentLoaded', async () => {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) handleOAuthSuccess(session.user);
    } catch(e) { console.error("Supabase Init Error:", e); }

    updateHUD();
    renderAchievementsList();
    initCanvasAnimation();
});

function updateHUD() {
    document.getElementById('hudUsername').innerText = myName;
    document.getElementById('hudCoins').innerText = coins.toLocaleString();
    document.getElementById('hudGems').innerText = gems.toLocaleString();
    document.getElementById('hudLevelBadge').innerText = "Lvl " + playerLevel;
    
    const avatarBox = document.getElementById('hudAvatarContainer');
    if (myAvatar.startsWith('data:image') || myAvatar.startsWith('http')) {
        avatarBox.innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover rounded-full">`;
    } else {
        avatarBox.innerText = myAvatar;
    }
    document.getElementById('hudTitle').innerText = calculateTopTitle();
}

function calculateTopTitle() {
    const stats = JSON.parse(localStorage.getItem('mafia_stats')) || {};
    for (let ach of ACHIEVEMENTS_DEFINITIONS) {
        if (ach.title && (stats[ach.key] || 0) >= ach.target) return ach.title;
    }
    return "Unranked Citizen";
}

function proceedToAuth() {
    document.getElementById('screenSplash').classList.add('hidden');
    document.getElementById('screenAuth').classList.remove('hidden');
}

function playAsGuest() {
    localStorage.setItem('mafia_user_mode', 'Guest Mode');
    if (!localStorage.getItem('mafia_username')) {
        localStorage.setItem('mafia_username', 'Guest_' + Math.floor(1000 + Math.random() * 9000));
    }
    myName = localStorage.getItem('mafia_username');
    enterMainHub();
}

function handleOAuthSuccess(user) {
    const provider = user.app_metadata.provider || 'OAuth';
    const name = user.user_metadata.full_name || user.email.split('@')[0];
    const avatarUrl = user.user_metadata.avatar_url || user.user_metadata.picture || '👑';

    localStorage.setItem('mafia_user_mode', `${provider.toUpperCase()} Account (${user.email})`);
    localStorage.setItem('mafia_username', name);
    localStorage.setItem('mafia_avatar', avatarUrl);
    
    myName = name; myAvatar = avatarUrl;
    enterMainHub();
}

async function loginWithGoogle() {
    if(supabaseClient) await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
}

async function loginWithFacebook() {
    if(supabaseClient) await supabaseClient.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo: window.location.origin } });
}

async function loginWithEmail() {
    const email = document.getElementById('inputEmail').value;
    const pass = document.getElementById('inputPassword').value;
    if(!email || !pass) { alert("Enter email and password"); return; }
    if(supabaseClient) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
        if(error) { alert(error.message); return; }
    }
    localStorage.setItem('mafia_user_mode', `Email Account (${email})`);
    localStorage.setItem('mafia_username', email.split('@')[0]);
    myName = email.split('@')[0]; enterMainHub();
}

async function registerWithEmail() {
    const email = document.getElementById('inputEmail').value;
    const pass = document.getElementById('inputPassword').value;
    if(!email || !pass) { alert("Enter email and password"); return; }
    if(supabaseClient) {
        const { error } = await supabaseClient.auth.signUp({ email, password: pass });
        if(error) { alert(error.message); return; }
    }
    alert("Account created!"); enterMainHub();
}
function enterMainHub() {
    document.getElementById('screenAuth').classList.add('hidden');
    document.getElementById('screenMainHub').classList.remove('hidden');
    updateHUD();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// PRIVATE ROOM SELECTION & WAITING LOBBY MODALS
function openPrivateRoomModal() {
    document.getElementById('privateRoomModal').classList.remove('hidden');
}

function closePrivateRoomModal() {
    document.getElementById('privateRoomModal').classList.add('hidden');
}

async function createNewPrivateRoom() {
    closePrivateRoomModal();
    const newCode = "ROOM_" + Math.floor(100000 + Math.random() * 900000);
    await enterPrivateLobby(newCode, 8, true);
}

async function joinPrivateRoomByCode() {
    const code = document.getElementById('inputJoinPrivateCode').value.trim().toUpperCase();
    if(!code) { alert("Please enter a valid room code."); return; }
    closePrivateRoomModal();
    await enterPrivateLobby(code, 8, false);
}

async function enterPrivateLobby(code, maxP, createdByMe) {
    currentRoomCode = code;
    const { data } = await supabaseClient.from('game_rooms').select('*').eq('room_code', code).single();

    if (!data || !data.state) {
        gameState = {
            roomCode: code, maxPlayers: maxP, status: "waiting_lobby", phase: "night", winner: null,
            hostName: myName,
            players: [{ name: myName, role: 'Citizen', alive: true, avatar: myAvatar, ready: true }],
            nightActions: { mafiaTarget: null, doctorTarget: null, policeTarget: null },
            votes: {}, chatMessages: [], mafiaChatMessages: [], lastNightResult: "Lobby created."
        };
    } else {
        gameState = data.state;
        if (!gameState.players.some(p => p.name === myName)) {
            gameState.players.push({ name: myName, role: 'Citizen', alive: true, avatar: myAvatar, ready: false });
        }
    }

    await supabaseClient.from('game_rooms').upsert({ room_code: code, state: gameState });
    setupRealtime(code);
    renderPrivateLobbyUI();
    document.getElementById('privateLobbyModal').classList.remove('hidden');
}

function renderPrivateLobbyUI() {
    document.getElementById('lobbyCodeDisplay').innerText = currentRoomCode;
    document.getElementById('lobbyPlayerCount').innerText = gameState.players.length;
    document.getElementById('lobbyMaxPlayers').innerText = gameState.maxPlayers;

    const roster = document.getElementById('lobbyPlayerRoster');
    roster.innerHTML = gameState.players.map(p => `
        <div class="bg-slate-900 border border-slate-800 p-2 rounded-xl flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
                <span>${p.avatar || '👤'}</span>
                <span class="font-bold text-slate-200 truncate max-w-[80px]">${p.name}</span>
            </div>
            <span class="text-[10px] font-mono ${p.ready ? 'text-emerald-400' : 'text-amber-400'}">
                ${p.name === gameState.hostName ? '👑 Host' : (p.ready ? 'Ready ✅' : 'Waiting...')}
            </span>
        </div>
    `).join('');

    const actionBox = document.getElementById('lobbyActionContainer');
    if (myName === gameState.hostName) {
        const canStart = gameState.players.length >= 4;
        actionBox.innerHTML = `
            <button onclick="hostStartPrivateGame()" ${canStart ? '' : 'disabled'} class="w-full ${canStart ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} py-3 rounded-xl text-xs uppercase shadow tracking-wider transition">
                ${canStart ? '🚀 Start Game Now' : 'Need at least 4 Players to Start'}
            </button>`;
    } else {
        const me = gameState.players.find(p => p.name === myName);
        const isReady = me ? me.ready : false;
        actionBox.innerHTML = `
            <button onclick="togglePlayerReady()" class="w-full ${isReady ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-slate-950'} font-bold py-3 rounded-xl text-xs uppercase shadow transition">
                ${isReady ? '✅ You are Ready! (Click to Unready)' : '⚡ Set Status to Ready'}
            </button>`;
    }
}

async function togglePlayerReady() {
    const me = gameState.players.find(p => p.name === myName);
    if (me) {
        me.ready = !me.ready;
        await supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
    }
}

async function hostStartPrivateGame() {
    if (gameState.players.length < 4) {
        alert("You need at least 4 players to start a private game.");
        return;
    }
    document.getElementById('privateLobbyModal').classList.add('hidden');
    assignRolesAndStartGame();
}

function leavePrivateLobby() {
    gameState.players = gameState.players.filter(p => p.name !== myName);
    supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
    document.getElementById('privateLobbyModal').classList.add('hidden');
}

function saveProfileName() {
    const newName = document.getElementById('inputEditProfileName').value.trim();
    if(!newName) return;
    myName = newName;
    localStorage.setItem('mafia_username', myName);
    updateHUD();
    alert("Profile name updated to: " + myName);
}

function setProfileAvatar(emoji) {
    myAvatar = emoji;
    localStorage.setItem('mafia_avatar', emoji);
    updateHUD(); renderModalAvatar();
}

function uploadProfilePhoto(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 120; canvas.height = 120;
            ctx.drawImage(img, 0, 0, 120, 120);
            myAvatar = canvas.toDataURL('image/jpeg', 0.8);
            localStorage.setItem('mafia_avatar', myAvatar);
            updateHUD(); renderModalAvatar();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderModalAvatar() {
    const box = document.getElementById('modalAvatarPreview');
    if (myAvatar.startsWith('data:image') || myAvatar.startsWith('http')) {
        box.innerHTML = `<img src="${myAvatar}" class="w-full h-full object-cover">`;
    } else { box.innerText = myAvatar; }
}

function openProfileModal() {
    const mode = localStorage.getItem('mafia_user_mode') || 'Guest Mode';
    document.getElementById('inputEditProfileName').value = myName;
    document.getElementById('profileAuthSource').innerText = "Logged in via: " + mode;
    renderModalAvatar();
    
    const stats = JSON.parse(localStorage.getItem('mafia_stats')) || { win6p:0, win8p:0, win12p:0, winClub:0 };
    document.getElementById('win6p').innerText = stats.win6p || 0;
    document.getElementById('win8p').innerText = stats.win8p || 0;
    document.getElementById('win12p').innerText = stats.win12p || 0;
    document.getElementById('winClub').innerText = stats.winClub || 0;

    document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() { document.getElementById('profileModal').classList.add('hidden'); }

function openSettingsModal() {
    const mode = localStorage.getItem('mafia_user_mode') || 'Guest Mode';
    document.getElementById('settingsAccountType').innerText = mode;
    
    const actionBox = document.getElementById('settingsAuthActionBox');
    if (mode === 'Guest Mode') {
        actionBox.innerHTML = `
            <button onclick="closeSettingsModal(); proceedToAuth();" class="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black py-2.5 rounded-xl text-xs shadow">
                🔗 Connect Account / Sign In (Sync Data)
            </button>`;
    } else {
        actionBox.innerHTML = `
            <button onclick="logoutPlayer()" class="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold py-2.5 rounded-xl text-xs border border-red-500/40 shadow">
                Sign Out / Log Out 🚪
            </button>`;
    }
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }

function logoutPlayer() {
    if(supabaseClient) supabaseClient.auth.signOut();
    localStorage.removeItem('mafia_user_mode');
    localStorage.removeItem('mafia_username');
    window.location.reload();
}

function renderAchievementsList() {
    const stats = JSON.parse(localStorage.getItem('mafia_stats')) || {};
    const container = document.getElementById('achievementsList');
    if(!container) return;

    container.innerHTML = ACHIEVEMENTS_DEFINITIONS.map(ach => {
        const val = stats[ach.key] || 0;
        const pct = Math.min(100, Math.floor((val / ach.target) * 100));
        const unlocked = val >= ach.target;

        return `
            <div class="bg-slate-950 p-3.5 rounded-2xl border ${unlocked ? 'border-amber-500/50 shadow-lg' : 'border-slate-800'} space-y-1.5">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-slate-200">${ach.name} ${unlocked ? '✅' : ''}</span>
                    <span class="font-mono text-[10px] ${unlocked ? 'text-amber-400 font-bold' : 'text-slate-400'}">${val} / ${ach.target}</span>
                </div>
                <div class="text-[10px] text-slate-400">${ach.desc}</div>
                <div class="w-full bg-slate-900 rounded-full h-1.5 mt-1 overflow-hidden">
                    <div class="bg-amber-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
                </div>
            </div>`;
    }).join('');
}

async function joinAutomatedMatchmaking(targetPlayers) {
    const code = "GLOBAL_" + targetPlayers + "P";
    await enterOrRegisterRoom(code, targetPlayers);
}

async function enterOrRegisterRoom(code, maxP) {
    currentRoomCode = code;
    const { data } = await supabaseClient.from('game_rooms').select('*').eq('room_code', code).single();

    if (!data || !data.state) {
        gameState = {
            roomCode: code, maxPlayers: maxP, status: "waiting", phase: "night", winner: null,
            hostName: myName,
            players: [{ name: myName, role: 'Citizen', alive: true, avatar: myAvatar }],
            nightActions: { mafiaTarget: null, doctorTarget: null, policeTarget: null },
            votes: {}, chatMessages: [], mafiaChatMessages: [], lastNightResult: "Lobby formed."
        };
    } else {
        gameState = data.state;
        if (!gameState.players.some(p => p.name === myName)) {
            gameState.players.push({ name: myName, role: 'Citizen', alive: true, avatar: myAvatar });
        }
    }

    if (gameState.players.length >= gameState.maxPlayers && gameState.status === "waiting") {
        assignRolesAndStartGame();
    } else {
        await supabaseClient.from('game_rooms').upsert({ room_code: code, state: gameState });
    }

    setupRealtime(code);
    enterDashboard();
}

function assignRolesAndStartGame() {
    let shuffled = [...gameState.players].sort(() => Math.random() - 0.5);
    let mafiaCount = shuffled.length >= 8 ? 2 : 1;

    shuffled.forEach((p, idx) => {
        if (idx < mafiaCount) p.role = "Mafia";
        else if (idx === mafiaCount) p.role = "Doctor";
        else if (idx === mafiaCount + 1) p.role = "Police";
        else p.role = "Citizen";
        p.alive = true;
    });

    gameState.players = shuffled;
    gameState.status = "playing";
    gameState.phase = "night";
    gameState.votes = {};
    gameState.nightActions = { mafiaTarget: null, doctorTarget: null, policeTarget: null };
    gameState.lastNightResult = "Game automatically started! Night falls.";
    
    supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
}

function setupRealtime(code) {
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient.channel('room_' + code)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `room_code=eq.${code}` }, payload => {
            if (payload.new && payload.new.state) {
                gameState = payload.new.state;
                if (gameState.status === "waiting_lobby") {
                    renderPrivateLobbyUI();
                } else {
                    document.getElementById('privateLobbyModal').classList.add('hidden');
                    renderGameDashboard();
                    if (gameState.status === "ended") handleGameEnding();
                }
            }
        }).subscribe();
}

function enterDashboard() {
    document.getElementById('screenMainHub').classList.add('hidden');
    document.getElementById('screenDashboard').classList.remove('hidden');
    document.getElementById('displayGameRoomCode').innerText = currentRoomCode;
    renderGameDashboard();
}

function renderGameDashboard() {
    document.getElementById('displayPlayerName').innerText = myName;
    const pObj = gameState.players.find(p => p.name === myName);
    const roleEl = document.getElementById('displayPlayerRole');
    const descEl = document.getElementById('displayRoleDesc');
    const mafiaChat = document.getElementById('mafiaSecretChatCard');

    if (pObj) {
        roleEl.innerText = pObj.role + (pObj.alive ? '' : ' (Eliminated 💀)');
        if (pObj.role === "Mafia") {
            descEl.innerText = "Eliminate villagers in complete secrecy at night.";
            if(pObj.alive && gameState.phase === 'night') mafiaChat.classList.remove('hidden');
            else mafiaChat.classList.add('hidden');
        } else {
            mafiaChat.classList.add('hidden');
            if (pObj.role === "Doctor") descEl.innerText = "Protect a target each night from Mafia strikes.";
            else if (pObj.role === "Police") descEl.innerText = "Inspect a target's role each night.";
            else descEl.innerText = "Discuss in day chat and vote out suspected Mafia.";
        }
    }

    const nightCard = document.getElementById('nightActionCard');
    const dayCard = document.getElementById('dayActionCard');
    const chatSec = document.getElementById('dayChatSection');

    if (gameState.phase === "night") {
        document.getElementById('badgePhase').innerText = "Night Phase 🌙";
        document.getElementById('titlePhase').innerText = gameState.lastNightResult;
        dayCard.classList.add('hidden'); chatSec.classList.add('hidden');
        if (pObj && pObj.alive) renderNightActions(pObj);
        else nightCard.classList.add('hidden');
    } else {
        document.getElementById('badgePhase').innerText = "Day Phase ☀️";
        document.getElementById('titlePhase').innerText = gameState.lastNightResult;
        nightCard.classList.add('hidden'); chatSec.classList.remove('hidden');
        renderChatMessages(); renderMafiaChatMessages();
        if (pObj && pObj.alive) {
            dayCard.classList.remove('hidden');
            populateVoteDropdown();
            renderVotingTracker();
        } else dayCard.classList.add('hidden');
    }
    renderPlayerGrid();
}

function renderNightActions(pObj) {
    const card = document.getElementById('nightActionCard');
    const content = document.getElementById('nightActionContent');
    card.classList.remove('hidden');

    if (pObj.role === "Mafia") {
        let targets = gameState.players.filter(p => p.alive && p.role !== "Mafia").map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        let locked = gameState.nightActions.mafiaTarget ? ` ✅ Target: ${gameState.nightActions.mafiaTarget}` : '';
        content.innerHTML = `<label class="block text-slate-400">Target to eliminate:</label><select id="mafiaTarget" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200">${targets}</select><button onclick="submitNightAction('mafia')" class="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-2 rounded-xl mt-2 shadow">Confirm Target 🎯</button><div class="text-emerald-400 font-bold text-[10px]">${locked}</div>`;
    } else if (pObj.role === "Doctor") {
        let targets = gameState.players.filter(p => p.alive).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        let locked = gameState.nightActions.doctorTarget ? ` ✅ Healed: ${gameState.nightActions.doctorTarget}` : '';
        content.innerHTML = `<label class="block text-slate-400">Target to protect:</label><select id="docTarget" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200">${targets}</select><button onclick="submitNightAction('doctor')" class="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2 rounded-xl mt-2 shadow">Protect Target 💉</button><div class="text-emerald-400 font-bold text-[10px]">${locked}</div>`;
    } else if (pObj.role === "Police") {
        let targets = gameState.players.filter(p => p.alive && p.name !== myName).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        content.innerHTML = `<label class="block text-slate-400">Target to inspect:</label><select id="policeTarget" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200">${targets}</select><button onclick="submitNightAction('police')" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-xl mt-2 shadow">Inspect Role 🔍</button><div id="policeRes" class="text-amber-300 font-mono text-[11px] pt-1"></div>`;
    } else {
        content.innerHTML = `<p class="text-slate-400 italic">Village is asleep... Wait for night to end.</p>`;
    }
}

async function submitNightAction(type) {
    if (type === 'mafia') gameState.nightActions.mafiaTarget = document.getElementById('mafiaTarget').value;
    else if (type === 'doctor') gameState.nightActions.doctorTarget = document.getElementById('docTarget').value;
    else if (type === 'police') {
        let tName = document.getElementById('policeTarget').value;
        let t = gameState.players.find(p => p.name === tName);
        if(t) document.getElementById('policeRes').innerText = `${t.name} is [ ${t.role} ]!`;
        gameState.nightActions.policeTarget = tName;
    }

    const livingMafia = gameState.players.filter(p => p.alive && p.role === "Mafia").length > 0;
    const livingDoc = gameState.players.filter(p => p.alive && p.role === "Doctor").length > 0;
    const livingPolice = gameState.players.filter(p => p.alive && p.role === "Police").length > 0;

    const mafiaDone = !livingMafia || gameState.nightActions.mafiaTarget;
    const docDone = !livingDoc || gameState.nightActions.doctorTarget;
    const policeDone = !livingPolice || gameState.nightActions.policeTarget;

    if (mafiaDone && docDone && policeDone) {
        let mTarget = gameState.nightActions.mafiaTarget;
        let dTarget = gameState.nightActions.doctorTarget;

        if (mTarget && dTarget && mTarget === dTarget) {
            gameState.lastNightResult = `🛡️ Doctor Saved the Day! Mafia targeted ${mTarget}, but Doctor protected them!`;
        } else if (mTarget) {
            let victim = gameState.players.find(p => p.name === mTarget);
            if (victim) { victim.alive = false; gameState.lastNightResult = `💀 ${victim.name} was eliminated by the Mafia last night!`; }
        } else gameState.lastNightResult = "🌙 A peaceful night passed. No deaths occurred.";

        if (!checkWinConditions()) {
            gameState.phase = "day";
            gameState.votes = {};
            gameState.nightActions = { mafiaTarget: null, doctorTarget: null, policeTarget: null };
        }
    }

    await supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
}

function populateVoteDropdown() {
    const select = document.getElementById('selectVoteTarget');
    select.innerHTML = gameState.players.filter(p => p.alive && p.name !== myName).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
}

function renderVotingTracker() {
    const container = document.getElementById('liveVotingTrackerList');
    container.innerHTML = gameState.players.filter(p => p.alive).map(p => {
        let v = gameState.votes ? gameState.votes[p.name] : null;
        return v 
            ? `<div class="bg-slate-950 p-2 rounded border border-slate-800 flex justify-between"><span>${p.name}</span><span class="text-emerald-400 font-bold">Voted ➔ ${v} ✅</span></div>`
            : `<div class="bg-slate-950 p-2 rounded border border-slate-800 flex justify-between"><span>${p.name}</span><span class="text-amber-400 font-bold">Pending ⏳</span></div>`;
    }).join('');
}

async function castVote() {
    let target = document.getElementById('selectVoteTarget').value;
    if (!gameState.votes) gameState.votes = {};
    gameState.votes[myName] = target;

    const livingPlayers = gameState.players.filter(p => p.alive);
    const totalVotes = Object.keys(gameState.votes).length;

    if (totalVotes >= livingPlayers.length) {
        let tally = {};
        Object.values(gameState.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });

        let maxV = 0, eliminatedTarget = null;
        for (let [t, c] of Object.entries(tally)) {
            if (c > maxV) { maxV = c; eliminatedTarget = t; }
        }

        if (eliminatedTarget && maxV > 0) {
            let p = gameState.players.find(x => x.name === eliminatedTarget);
            if (p) { p.alive = false; gameState.lastNightResult = `🗳️ Village voted out ${eliminatedTarget} (${p.role}).`; }
        } else gameState.lastNightResult = `🗳️ Village votes ended in a tie. No one was eliminated.`;

        if (!checkWinConditions()) {
            gameState.phase = "night";
            gameState.votes = {};
            gameState.nightActions = { mafiaTarget: null, doctorTarget: null, policeTarget: null };
        }
    }

    await supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
}

function checkWinConditions() {
    let mafiaAlive = gameState.players.filter(p => p.alive && p.role === 'Mafia').length;
    let villagersAlive = gameState.players.filter(p => p.alive && p.role !== 'Mafia').length;

    if (mafiaAlive === 0) { gameState.status = "ended"; gameState.winner = "Village"; return true; }
    else if (mafiaAlive >= villagersAlive) { gameState.status = "ended"; gameState.winner = "Mafia"; return true; }
    return false;
}

function handleGameEnding() {
    playerLevel += 1;
    localStorage.setItem('mafia_level', playerLevel);
    updateHUD();

    if (playerLevel === 10) {
        document.getElementById('level10Modal').classList.remove('hidden');
    }
    showGameOverModal();
}

function closeLevel10Modal() {
    document.getElementById('level10Modal').classList.add('hidden');
}

function claimLevel10StarterPack() {
    alert("Redirecting to Level 10 Syndicate Pack Claim...");
    closeLevel10Modal();
}

function showGameOverModal() {
    const modal = document.getElementById('gameOverModal');
    modal.classList.remove('hidden');
    if (gameState.winner === "Village") {
        document.getElementById('gameOverIcon').innerText = "🛡️🎉";
        document.getElementById('gameOverTitle').innerText = "Village Victory!";
        document.getElementById('gameOverDesc').innerText = "All Mafia members have been eliminated. The village is safe!";
    } else {
        document.getElementById('gameOverIcon').innerText = "🗡️🔥";
        document.getElementById('gameOverTitle').innerText = "Mafia Victory!";
        document.getElementById('gameOverDesc').innerText = "The Mafia has taken over the village!";
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInputMessage');
    const text = input.value.trim(); if (!text) return;
    if(!gameState.chatMessages) gameState.chatMessages = [];
    gameState.chatMessages.push({ sender: myName, text: text, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) });
    input.value = '';
    await supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
}

function renderChatMessages() {
    const list = document.getElementById('chatMessagesList');
    if(!gameState.chatMessages || gameState.chatMessages.length === 0) { list.innerHTML = `<p class="text-slate-500 italic text-center py-2">No discussion messages yet.</p>`; return; }
    list.innerHTML = gameState.chatMessages.map(m => `<div><span class="text-amber-400 font-bold">${m.sender}:</span> <span class="text-slate-200">${m.text}</span></div>`).join('');
    list.scrollTop = list.scrollHeight;
}

async function sendMafiaChat() {
    const input = document.getElementById('inputMafiaChat');
    const text = input.value.trim(); if (!text) return;
    if(!gameState.mafiaChatMessages) gameState.mafiaChatMessages = [];
    gameState.mafiaChatMessages.push({ sender: myName, text: text });
    input.value = '';
    await supabaseClient.from('game_rooms').upsert({ room_code: currentRoomCode, state: gameState });
}

function renderMafiaChatMessages() {
    const list = document.getElementById('mafiaChatMessages');
    if(!gameState.mafiaChatMessages || gameState.mafiaChatMessages.length === 0) { list.innerHTML = `<p class="text-slate-500 italic text-center">Secret Mafia Chat...</p>`; return; }
    list.innerHTML = gameState.mafiaChatMessages.map(m => `<div><span class="text-red-400 font-bold">${m.sender}:</span> <span class="text-slate-200">${m.text}</span></div>`).join('');
    list.scrollTop = list.scrollHeight;
}

function renderPlayerGrid() {
    document.getElementById('playerGrid').innerHTML = gameState.players.map(p => `
        <div class="p-3 rounded-xl border flex justify-between items-center ${p.alive ? 'bg-slate-950 border-slate-800 shadow-inner' : 'eliminated-card'}">
            <div class="flex items-center gap-2">
                <span class="text-base">${p.avatar || '👤'}</span>
                <div>
                    <span class="font-bold text-xs ${p.alive ? 'text-slate-200' : 'eliminated-name'}">${p.name}</span>
                    <div class="text-[10px] text-slate-400">${p.alive ? '🟢 Alive' : '💀 Eliminated'}</div>
                </div>
            </div>
            <span class="text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-400 font-semibold">${(!p.alive || p.name === myName) ? p.role : 'Secret'}</span>
        </div>
    `).join('');
}

let canvasAngle = 0;
function initCanvasAnimation() {
    const canvas = document.getElementById('votingCanvas'); if(!canvas) return;
    const ctx = canvas.getContext('2d');

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath(); ctx.arc(canvas.width/2, canvas.height/2, 55, 0, Math.PI * 2);
        ctx.fillStyle = '#09090b'; ctx.fill(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.stroke();

        const players = gameState.players.length > 0 ? gameState.players : [{name:'P1'},{name:'P2'},{name:'P3'},{name:'P4'},{name:'P5'},{name:'P6'}];
        canvasAngle += 0.005;

        players.forEach((p, idx) => {
            const angle = canvasAngle + (idx * (Math.PI * 2 / players.length));
            const x = canvas.width/2 + Math.cos(angle) * 80;
            const y = canvas.height/2 + Math.sin(angle) * 80;

            ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
            ctx.fillStyle = p.alive === false ? '#27272a' : '#f59e0b'; ctx.fill();
            ctx.fillStyle = '#ffffff'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
            ctx.fillText(p.name ? p.name.substring(0, 4) : 'User', x, y + 20);
        });
        requestAnimationFrame(draw);
    }
    draw();
}

function buyPackage(pkg, price) {
    alert(`Initiating Purchase for ${pkg} ($${price})...`);
}

function buyTimedBooster(name, hours, cost) {
    if (gems >= cost) {
        gems -= cost;
        localStorage.setItem('mafia_gems', gems);
        updateHUD();
        alert(`Activated ${name}! Expires in ${hours} hours.`);
    } else {
        alert("Insufficient Gems! Top up in the Gem Vault.");
    }
}

function createGang() { alert("Gang creation requires 10,000 Coins."); }
function joinGang() { alert("Searching open squads..."); }