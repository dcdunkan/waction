async function run() {
	if (window.lastFrame != null) {
		cancelAnimationFrame(window.lastFrame);
	}

	// constants
	const SVG_ICONS = {
		play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`,
		pause: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>`,
		stop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`
	};
	const CANVAS_BACKGROUND_COLOR = "#fff";
	const GAME_STATES = {
		PLAYING: 1,
		PAUSED: 2,
		STOPPED: 3
	};
	const MILLISECOND = 1,
		SECOND = 1000 * MILLISECOND,
		MINUTE = 60 * SECOND,
		HOUR = 60 * MINUTE;

	// globals
	window.lastFrame = null;
	window.gameCurrentState = GAME_STATES.STOPPED;
	window.gameData = null;

	// style="animation: spin 2s linear infinite;"
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

		act(delta) {}
		draw() {}
	}

	class ImageActor extends Actor {
		img = new Image();

		constructor() {
			super();

			this.visible = false;

			this.img.onload = () => {
				this.visible = true;
			}
		}

		act(delta) {
			super.act(delta);

			let dx = delta * 30;
			this.x += dx;
			this.y += dx;
		}

		draw() {
			super.draw();

			const radius = this.img.width / 2;
			this.stage.ctx.save();
			this.stage.ctx.beginPath();
			this.stage.ctx.arc(this.x + radius, this.y + radius, radius, 0, Math.PI * 2);
			this.stage.ctx.clip();
			this.stage.ctx.drawImage(this.img, this.x, this.y);
			this.stage.ctx.restore();
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

	function initialize() {
		let lastTimestamp = null;
		let frames = 0;
		let secondProgress = 0;

		const canvas = document.getElementById("game-canvas");
		const stage = new Stage(canvas);

		const actor = new ImageActor();
		actor.img.src = "https://pps.whatsapp.net/v/t61.24694-24/144532566_122644909725307_1437525764302012490_n.jpg?stp=dst-jpg_s96x96_tt6&ccb=11-4&oh=01_Q5Aa2gEE1iuUGKdL-T7UC59rlqof0ygj_MPGt59HV6NAWlPbLw&oe=68DAAD7F&_nc_sid=5e03e0&_nc_cat=102";
		stage.addActor(actor);

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
		window.gameCurrentState = GAME_STATES.PLAYING;
		console.info("PLAYING");
		controlButton.firstChild.onclick = stop;
		changeControlButtonIcon(SVG_ICONS.stop);

		initialize();
	};

	function stop() {
		window.gameCurrentState = GAME_STATES.STOPPED;
		console.info("STOPPING");
		controlButton.firstChild.onclick = play;
		changeControlButtonIcon(SVG_ICONS.play);

		if (window.lastFrame == null) {
			console.error("No game to stop??!");
			return;
		}
		cancelAnimationFrame(window.lastFrame);
	}
};

await run();

function setupData() {
	return new Promise((resolve, reject) => {
		const dbOpenRequest = indexedDB.open("model-storage");
		dbOpenRequest.onerror = (event) => {
			console.log(event)
			console.error("Something went wrong")
			reject();
		}
		dbOpenRequest.onsuccess = async () => {
			const db = dbOpenRequest.result;
			const transaction = db.transaction(db.objectStoreNames, "readonly");
			const chats = await getStoreData(transaction, "chat");
			const profilePicThumbs = await getStoreData(transaction, "profile-pic-thumb");
			// const messages = await getStoreData(transaction, "message");
			const contacts = await getStoreData(transaction, "contact");
			const participants = await getStoreData(transaction, "participant");
			resolve({
				chats,
				profilePicThumbs,
				contacts,
				participants
			});
		}
	})
};

(async () => {
	const stored = await setupData();

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

	// 	console.log(stored.participants)
})();

function getStoreData(transaction, storeName) {
	return new Promise((resolve, reject) => {
		const request = transaction.objectStore(storeName).getAll();
		request.onerror = () => reject();
		request.onsuccess = () => resolve(request.result);
	})
}