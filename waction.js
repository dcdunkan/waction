async function run() {
	if (window.lastFrame != null) {
		cancelAnimationFrame(window.lastFrame);
	}
	
	if (window.restoreListeners) {
		window.restoreListeners();
	}

	// constants
	const SVG_ICONS = {
		play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`,
		pause: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>`,
		stop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`,
		loaderCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>`,
	};
	const CANVAS_BACKGROUND_COLOR = "#000";
	const GAME_STATES = [
		"PLAYING",
		"LOADING_DATA",
		"PAUSED",
		"STOPPED"
	].reduce((p, state, i) => {
		p[state] = i;
		return p;
	}, {});
	const MILLISECOND = 1,
		SECOND = 1000 * MILLISECOND,
		MINUTE = 60 * SECOND,
		HOUR = 60 * MINUTE;

	// globals
	window.lastFrame = null;
	window.gameCurrentState = GAME_STATES.STOPPED;

	let CHATS = null;
	let ME = null;
	let gameData = null;

	let currentKey = {};
	let currentKeyTime = {};

	const CHARACTER_SIZE = 64;

	// classes
	class Actor {
		x = 0;
		y = 0;
		visible = true;
		stage = null;

		constructor() {
			this.x = 0;
			this.y = 0;
			this.visible = true;
			this.stage = null;
		}

		setStage(stage) {
			this.stage = stage;
		}

		setPosition(x, y) {
			this.x = x;
			this.y = y;
		}

		act(delta) {}
		draw() {}
	}

	class ChatActor extends Actor {
		img = new Image();
		chat = null;
		chatName = null;

		constructor(chat) {
			super();

			this.visible = false;

			this.img.onload = () => {
				this.visible = true;
			}

			this.setChat(chat);
		}

		setChat(chat) {
			this.chat = chat;

			if (chat == null) return;

			if (chat.pp && chat.pp.preview) {
				this.visible = false;
				this.img.src = chat.pp.preview;
			}

			this.chatName = chat.name || (chat.contact != null ? (chat.contact.name || chat.contact.shortName || chat.contact.pushname || chat.contact.phoneNumber) : "Unknown");
		}

		act(delta) {
			super.act(delta);
		}

		draw() {
			super.draw();

			if (this.chat == null) return;

			const radius = CHARACTER_SIZE / 2;

			const ctx = this.stage.ctx;

			ctx.save();
			ctx.beginPath();
			ctx.arc(this.x + radius, this.y + radius, radius, 0, Math.PI * 2);
			ctx.clip();
			ctx.drawImage(this.img, this.x, this.y, CHARACTER_SIZE, CHARACTER_SIZE);
			ctx.restore();

			ctx.font = "16px 'Arial'";
			ctx.textAlign = "center";
			ctx.fillStyle = "#fff";
			ctx.fillText(this.chatName, this.x + radius, this.y + CHARACTER_SIZE + 20);
		}
	}

	class Stage {
		canvas;
		ctx;
		#actors;

		constructor(canvas) {
			this.canvas = canvas;
			this.ctx = canvas.getContext("2d");
			this.#actors = [];
		}

		get width() {
			return this.canvas.width;
		}

		get height() {
			return this.canvas.height;
		}

		addActor(actor) {
			this.#actors.push(actor);
			actor.setStage(this);
		}

		act(delta) {
			for (const actor of this.#actors) {
				actor.act(delta);
			}
		}

		draw() {
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
			for (const actor of this.#actors) {
				if (actor.visible) {
					actor.draw();
				}
			}
		}
	}

	function setupGameArea() {
		const app = document.getElementById("app");
		const leftPanel = document.getElementById("side");
		const rightPanel = leftPanel.parentElement.nextSibling;
		while (rightPanel.lastElementChild) { // cleanup
			rightPanel.removeChild(rightPanel.lastElementChild);
		}

		const canvas = document.createElement("canvas");
		rightPanel.appendChild(canvas);

		canvas.id = "game-canvas";
		canvas.style.position = "fixed";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.backgroundColor = CANVAS_BACKGROUND_COLOR;
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;

		const sidebar = leftPanel.parentElement.previousSibling.previousSibling;
		const settingsButton = sidebar.querySelector("[aria-label='Settings']").parentElement;
		const bottomSidebarSection = settingsButton.parentElement;
		while (bottomSidebarSection.children.length > 2) { // cleanup
			bottomSidebarSection.removeChild(bottomSidebarSection.children[0]);
		}

		const gameControlButton = settingsButton.cloneNode(true);
		bottomSidebarSection.prepend(gameControlButton);
		gameControlButton.id = "wac-control-button";
	}

	// starting the game
	setupGameArea();

	const controlButton = document.getElementById("wac-control-button");
	controlButton.firstChild.onclick = play;
	changeControlButtonIcon(SVG_ICONS.play);

	function changeControlButtonIcon(svgIcon) {
		controlButton.firstChild.querySelector("span").innerHTML = svgIcon;
	}

	function blockInputOutside(canvas) {
		function stopEvent(e) {
			if (controlButton.contains(e.target)) {
				return;
			}
			
			
			if (!canvas.contains(e.target)) {
				e.stopPropagation();
				e.preventDefault();
			}
		}

		['click', 'mousedown', 'mouseup', 'contextmenu'].forEach(evt =>
			document.addEventListener(evt, stopEvent, true)
		);
		
		function resolveKey(key) {
			if (key === " ") {
				return "Space";
			}
			return key;
		}
		
		const keydown = (e) => {
			const key = resolveKey(e.key);
			console.info(key);
			currentKey[key] = true;
			currentKeyTime[key] = Date.now();
			e.stopPropagation();
			e.preventDefault();
		};
		document.addEventListener("keydown", keydown, true);
		const keyup = (e) => {
			const key = resolveKey(e.key);
			delete currentKey[key];
			delete currentKeyTime[key];
			e.stopPropagation();
			e.preventDefault();
		}
		document.addEventListener("keyup", keyup, true);

// 		['keydown', 'keyup', 'keypress'].forEach(evt =>
// 			document.addEventListener(evt, stopEvent, true)
// 		);

		return function restoreInput() {
			['click', 'mousedown', 'mouseup', 'contextmenu'].forEach(evt =>
				document.removeEventListener(evt, stopEvent, true)
			);
// 			['keydown', 'keyup', 'keypress'].forEach(evt =>
				document.removeEventListener("keydown", keydown, true);
				document.removeEventListener("keyup", keyup, true);
// 			);
		};
	}


	function initialize() {
		let lastTimestamp = null;
		let frames = 0;
		let secondProgress = 0;

		const canvas = document.getElementById("game-canvas");
		canvas.focus();
		window.restoreListeners = blockInputOutside(canvas);
		const stage = new Stage(canvas);

		const chatsWithProfile = Array.from(CHATS.values())
			.filter((chat) => {
				if (chat.pp == null || chat.pp.preview == null) return false;
				return chat.name != null || (chat.contact != null && (chat.contact.name != null || chat.contact.shortName != null || chat.contact.pushname != null));
			})
		const randomlySelectedChat = chatsWithProfile[Math.floor(Math.random() * chatsWithProfile.length)];

		const actor = new ChatActor(randomlySelectedChat);
		stage.addActor(actor);

		class Hero extends ChatActor {
			me;
			v = 300;

			constructor() {
				super(ME);
			}

			act(delta) {
				if (currentKey.ArrowRight) {
					this.x += delta * this.v;
				}
				if (currentKey.ArrowLeft) {
					this.x -= delta * this.v;
				}
				if (currentKey.Space) {
					this.y -= delta * this.v;
				}
			}
		}

		const hero = new Hero();
		hero.setPosition(100, stage.height - 300);
		stage.addActor(hero);

		function loop(frameTimestamp) {
			if (lastTimestamp == null) {
				lastTimestamp = frameTimestamp;
			}
			const delta = (frameTimestamp - lastTimestamp) / SECOND;
			lastTimestamp = frameTimestamp;

			frames++;
			secondProgress += delta;
			if (secondProgress >= 1) {
				secondProgress = 0;
				console.log("FPS:", frames);
				frames = 0;
			}

			stage.act(delta);
			stage.draw();
			window.lastFrame = requestAnimationFrame(loop);
		}
		window.lastFrame = requestAnimationFrame(loop);
	}

	function play() {
		window.gameCurrentState = GAME_STATES.LOADING_DATA;
		console.info("LOADING_DATA");
		changeControlButtonIcon(SVG_ICONS.loaderCircle);
		controlButton.style.animation = "spin 2s linear infinite";
		controlButton.firstChild.onclick = null;

		findRequiredWhatsappData()
			.then(({
				chats,
				me
			}) => {
				CHATS = chats;
				ME = me;

				window.gameCurrentState = GAME_STATES.PLAYING;
				console.info("PLAYING");
				controlButton.firstChild.onclick = stop;
				changeControlButtonIcon(SVG_ICONS.stop);

				initialize();
			})
			.catch((error) => {
				if (window.restoreListeners) {
					window.restoreListeners();
				}
				window.gameCurrentState = GAME_STATES.PLAY;
				controlButton.firstChild.onclick = play;
				changeControlButtonIcon(SVG_ICONS.play);

				console.error(error);
				alert("Failed to load data. Please check console.")
			})
			.finally(() => {
				controlButton.style.animation = "";
			});
	}

	function stop() {
		if (window.restoreListeners) {
			window.restoreListeners();
		}
		window.gameCurrentState = GAME_STATES.STOPPED;
		console.info("STOPPING");
		controlButton.firstChild.onclick = play;
		changeControlButtonIcon(SVG_ICONS.play);

		CHATS = null;
		ME = null;

		if (window.lastFrame == null) {
			console.error("No game to stop??!");
			return;
		}
		cancelAnimationFrame(window.lastFrame);
	}
};

await run();

async function findRequiredWhatsappData() {
	const stored = await getIndexedDbData();

	const pp = new Map();
	for (const ppThumb of stored.profilePicThumbs) {
		pp.set(ppThumb.id, {
			preview: ppThumb.previewEurl,
			full: ppThumb.eurl
		});
	}

	const participantsData = stored.participants.reduce((p, c) => {
		if (c.groupId in p) {
			throw new Error("it already exists?? wow!");
		}
		p[c.groupId] = c;
		return p;
	}, {});

	const contactsData = stored.contacts.reduce((p, c) => {
		if (c.phoneNumber == null) {
			return p;
		}
		if (c.phoneNumber in p) {
			const old = p[c.phoneNumber];
			if (c.pushname == null && c.name == null && old.shortName == null) {
				p[c.phoneNumber] = c;
			}
			return p;
		}
		p[c.phoneNumber] = c;
		return p;
	}, {});

	const chats = new Map();

	for (const chat of stored.chats) {
		if (chat.id === "0@c.us") continue;

		const profilePic = pp.get(chat.id);
		const [id, idType] = chat.id.split("@");
		const type = idType === "c.us" ?
			"private" :
			idType === "g.us" ?
			"group" :
			idType === "newsletter" ?
			"channel" :
			idType === "broadcast" ?
			"broadcast" :
			null;

		if (type == null) {
			console.error("unknown chat type", chat);
			continue;
		}

		const chatObject = {
			id: chat.id,
			type: type,
			name: chat.name,
			isSpam: !chat.notSpam,
			isLocked: chat.isLocked,
			pp: profilePic,
			unreadCount: chat.unreadCount,
			unreadMentionCount: chat.unreadMentionCount,
			isArchived: chat.archive,
			isMuted: chat.muteExpiration !== 0,
		};

		if (type === "private") {
			const contact = contactsData[chat.id];
			chatObject.contact = {
				id: contact.id,
				phoneNumber: Number(id),
				name: contact.name,
				shortName: contact.shortName,
				pushname: contact.pushname
			};
		} else if (type === "group") {
			const participants = participantsData[chat.id];
			if (participants == null) {
				throw new Error("should not be null!")
			}
			chatObject.participants = {
				admins: participants.admins,
				superAdmins: participants.superAdmins,
				participants: participants.participants,
				pastParticipants: participants.pastParticipants,
			};
		}

		chats.set(chat.id, chatObject);
	}

	const me = chats.get(stored.me.phoneNumber);
	if (me == null) {
		throw new Error("Could not find the authorised information user");
	}
	return {
		chats,
		me
	};
}

function getIndexedDbData() {
	return new Promise((resolve, reject) => {
		const dbOpenRequest = indexedDB.open("model-storage");
		dbOpenRequest.onerror = (event) => {
			console.log(event)
			console.error("Something went wrong")
			reject();
		};
		dbOpenRequest.onsuccess = async () => {
			const db = dbOpenRequest.result;
			const transaction = db.transaction(db.objectStoreNames, "readonly");
			const chats = await getStoreData(transaction, "chat");
			const profilePicThumbs = await getStoreData(transaction, "profile-pic-thumb");
			// const messages = await getStoreData(transaction, "message");
			const contacts = await getStoreData(transaction, "contact");
			const participants = await getStoreData(transaction, "participant");
			// 			const deviceList = await getStoreData(transaction, "device-list");
			const orphanTcToken = await getStoreData(transaction, "orphan-tc-token");
			if (orphanTcToken.length !== 1) {
				throw new Error("Failed to get the authorised user information");
			}
			const meJid = orphanTcToken[0].chatId;
			const meContact = contacts.find((contact) => contact.id === meJid);
			if (meContact == null) {
				throw new Error("What!");
			}
			const mePhoneNumber = meContact.phoneNumber;

			// 			for (const name of db.objectStoreNames) {
			// 				if (["message", "sync-actions", "reactions", "chat", "message-info", "participant", "poll-votes", "message-orphans", "message-association", "group-metadata", "orphan-revoke", "group-invite-v4"].includes(name)) continue;
			// 				const data = await getStoreData(transaction, name);
			// 				for (const dd of data) {
			// 					if (JSON.stringify(dd).includes("72103944556734")) {
			// 						console.log(name);
			// 						console.log(dd);
			// 					}
			// 				}
			// 			}


			resolve({
				chats,
				profilePicThumbs,
				contacts,
				participants,
				me: {
					jid: meJid,
					phoneNumber: mePhoneNumber,
				}
			});
		};
	})
}

function getStoreData(transaction, storeName) {
	return new Promise((resolve, reject) => {
		const request = transaction.objectStore(storeName).getAll();
		request.onerror = () => reject();
		request.onsuccess = () => resolve(request.result);
	})
}