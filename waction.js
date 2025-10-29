async function run() {
	// reset in case of improper exit (useful while debugging)
	if (window.lastFrame != null) {
		cancelAnimationFrame(window.lastFrame);
		window.lastFrame = null;
	}

	if (typeof window.restoreListeners === "function") {
		window.restoreListeners();
	}

	// engine constants
	const GAME_STYLESHEET = `@keyframes spin{to{transform:rotate(360deg)}}`;
	const SVG_ICONS = {
		play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`,
		pause: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause-icon lucide-pause"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>`,
		stop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`,
		loaderCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>`,
	};
	const CANVAS_BACKGROUND_COLOR = "#000";
	const GAME_STATES = indexObj(["PLAYING", "LOADING_DATA", "PAUSED", "STOPPED"]);
	const MILLISECOND = 1,
		SECOND = 1000 * MILLISECOND,
		MINUTE = 60 * SECOND,
		HOUR = 60 * MINUTE;
	const GAMEPAD_MAPPING = {
		standard: {
			buttons: indexObj(["a", "b", "x", "y", "lb", "rb", "lt", "rt", "select", "start", "ls", "rs", "dpad_up", "dpad_down", "dpad_left", "dpad_right", "center"]),
			axes: indexObj(["ls_x", "ls_y", "ua_x", "ua_y", "rs_x", "rs_y", "ub_x", "ub_y"]),
		}
	}
	const INPUT_MODES = ["mouse", "keyboard", "gamepad"];

	// helpers
	function randomStr(length) {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		let result = "";
		const randomArray = new Uint8Array(length);
		crypto.getRandomValues(randomArray);
		randomArray.forEach((number) => {
			result += chars[number % chars.length];
		});
		return result;
	}
	function indexObj(arr) {
		return arr.reduce((p, name, i) => ({
			...p,
			[name]: i
		}), {});
	}
	function randomFloat(min, max) {
		return Math.random() * (max - min + 1) + min;
	}
	function randomInt(min, max) {
		return Math.floor(randomFloat(min, max));
	}
	
	// game constants
	const GRAVITY = 1250;
	const BULLET_COOLDOWN_TIME = 0.1;	
	const MAX_ENEMIES_IN_A_WAVE = 1;
	const MIN_SPAWN_COOLDOWN = 1;
	const MAX_SPAWN_COOLDOWN = 5;
	const CHARACTER_SIZE = 64;

	// globals
	window.gameCurrentState = GAME_STATES.STOPPED;
	window.lastFrame = null;
	window.restoreListeners = null;
	
	let CHATS = null;
	let ME = null;
	let gameData = null;
	
	// inputs management
	function activateInputs(modes) {
		if (modes.length === 0) {
			throw new Error("unintended? specify at least one");
		}
		if (modes.some((mode, i) => i !== modes.lastIndexOf(mode))) {
			throw new Error("activateInputs: expected no duplicates in the modes array")
		}
		const input = {};

		for (const mode of modes) {
			if (mode === "mouse") {
				input.mouse = {
					x: null,
					y: null,
				};

				// todo: event.button or event.buttons? do i need buttons?
				function resolveMouseClick(event) {
					return ["left", "right", "wheel", "back", "forward"][event.button];
				}

				const mousedown = (e) => {
					const canvas = document.getElementById("game-canvas");
					if (canvas == null) {
						console.error("game canvas does not exist")
						return;
					}
					const leftWidth = document.body.clientWidth - canvas.width;
					const leftHeight = document.body.clientHeight - canvas.height;
					const button = resolveMouseClick(e);
					input.mouse[button] = true;
					input.mouse.x = e.clientX - leftWidth;
					input.mouse.y = e.clientY - leftHeight;
					e.stopPropagation();
					e.preventDefault();
				};
				const mouseup = (e) => {
					const button = resolveMouseClick(e);
					input.mouse[button] = false;
					input.mouse.x = null;
					input.mouse.y = null;
					e.stopPropagation();
					e.preventDefault();
				};

				input.mouse.activate = () => {
					window.addEventListener("mousedown", mousedown, true);
					window.addEventListener("mouseup", mouseup, true);
				};
				input.mouse.deactivate = () => {
					window.removeEventListener("mousedown", mousedown, true);
					window.removeEventListener("mouseup", mouseup, true);
				};
				input.mouse.update = (delta) => {};
			} else if (mode === "keyboard") {
				input.keyboard = {
					keys: {},
					times: {},
					isPressed: (key) => {
						return input.keyoard.keys[key] === true;
					},
				};

				function resolveKey(key) {
					if (key === " ") {
						return "Space";
					}
					return key;
				}

				const keydown = (e) => {
					const key = resolveKey(e.key);
					input.keyboard.keys[key] = true;
					input.keyboard.times[key] = Date.now();
					e.stopPropagation();
					e.preventDefault();
				};
				const keyup = (e) => {
					const key = resolveKey(e.key);
					delete input.keyboard.keys[key];
					delete input.keyboard.times[key];
					e.stopPropagation();
					e.preventDefault();
				};

				input.keyboard.activate = () => {
					window.addEventListener("keydown", keydown, true);
					window.addEventListener("keyup", keyup, true);
				}
				input.keyboard.deactivate = () => {
					window.removeEventListener("keydown", keydown, true);
					window.removeEventListener("keyup", keyup, true);
				}
				input.keyboard.update = (delta) => {};
			} else if (mode === "gamepad") {
				if (typeof navigator.getGamepads !== "function") {
					console.error("your browser does not have support for gamepads");
					continue;
				}
				
				input.gamepad = {
					pads: {},
				};
				
				let gamepadPermissionAllowed = false;
				
				try {
					for (const gamepad of navigator.getGamepads()) {
						if (gamepad.connected) {
							input.gamepad.pads[gamepad.index] = gamepad;
						}
					}
					gamepadPermissionAllowed = true;
				} catch (error) {
					gamepadPermissionAllowed = false;
					if (error instanceof DOMException && error.name === "SecurityError") {
						console.warn("This window context does not allow gamepads in the permission policy");
					} else {
						console.warn("Something went wrong while getting gamepads (disabling)")
					}
				}

				const gamepadconnected = (event) => {
					const gamepad = event.gamepad;
					if (!gamepad.connected) {
						console.warn("expected the gamepad to be connected");
						return;
					}
					input.gamepad.pads[gamepad.index] = gamepad;
				};
				const gamepaddisconnected = (event) => {
					delete input.gamepad.pads[event.gamepad.index];
					if (gamepad.connected) {
						console.warn("expected the gamepad to be disconnected");
						return;
					}
				};

				input.gamepad.activate = () => {
					window.addEventListener("gamepadconnected", gamepadconnected, true);
					window.addEventListener("gamepaddisconnected", gamepaddisconnected, true);
				};
				input.gamepad.deactivate = () => {
					window.removeEventListener("gamepadconnected", gamepadconnected, true);
					window.removeEventListener("gamepaddisconnected", gamepaddisconnected, true);
				};
				input.gamepad.update = (delta) => {
					if (!gamepadPermissionAllowed) return;
					for (const gamepad of navigator.getGamepads()) {
						if (!gamepad.connected) {
							console.warn("expected the gamepad to be connected");
							continue;
						}
						if (input.gamepad.pads[gamepad.index] == null) {
							input.gamepad.pads[gamepad.index] = gamepad;
						}
					}
				};
			} else {
				throw new Error("unknown type of input mode");
			}
		}

		input.activate = () => {
			for (const mode in input) {
				if (typeof input[mode].activate === "function")
					input[mode].activate();
			}
		}
		input.deactivate = () => {
			for (const mode in input) {
				if (typeof input[mode].deactivate === "function")
					input[mode].deactivate();
			}
		};
		input.update = (delta) => {
			for (const mode in input) {
				if (typeof input[mode].update === "function")
					input[mode].update(delta);
			}
		};

		return input;
	}

	const input = activateInputs(["mouse", "keyboard", "gamepad"]);
	window.restoreListeners = input.deactivate;
	
	// viewports
	class FitViewport {
		worldWidth;
		worldHeight;
		
		scale;
		canvasX;
		canvasY;
		canvasWidth;
		canvasHeight;
		
		constructor(worldWidth, worldHeight) {
			this.worldWidth = worldWidth;
			this.worldHeight = worldHeight;
			this.scale = 1;
			this.canvasX = 0;
			this.canvasY = 0;
			this.canvasWidth = 0;
			this.canvasHeight = 0;
		}
		
		update(canvasWidth, canvasHeight) {
			const limitingFactor = Math.min(
				canvasWidth / this.worldWidth,
				canvasHeight / this.worldHeight
			);
			this.scale = limitingFactor;
			
			this.canvasWidth = this.worldWidth * limitingFactor;
			this.canvasHeight = this.worldHeight * limitingFactor;
			
			this.canvasX = (canvasWidth - this.canvasWidth) / 2;
			this.canvasY = (canvasHeight - this.canvasHeight) / 2;
		}
		
		project(worldX, worldY) {
			return {
				x: this.canvasX + worldX * this.scale,
				y: this.canvasY + worldY * this.scale
			};
		}
		unproject(x, y) {
			return {
				worldX: (x - this.canvasX) / this.scale,
				worldY: (y - this.canvasY) / this.scale
			};
		}
	}
	
	// classes
	class BaseActor {
		id = "";
		stage = null;

		constructor() {
			this.id = "";
			this.stage = null;
		}

		setStage(stage) {
			this.stage = stage;
		}

		act(delta) {}
		draw() {}
	}

	class Actor extends BaseActor {
		x = 0;
		y = 0;
		width = 0;
		height = 0;
		visible = true;

		constructor() {
			super();
			this.x = 0;
			this.y = 0;
			this.visible = true;
			this.width = 0;
			this.height = 0;
		}

		setPosition(x, y) {
			this.x = x;
			this.y = y;
		}

		act(delta) {
			super.act(delta);
		}

		draw() {
			super.draw();
		}
	}

	class ChatActor extends Actor {
		img = new Image();
		chat = null;
		chatName = null;

		constructor(chat) {
			super();

			this.visible = false;
			this.width = CHARACTER_SIZE;
			this.height = CHARACTER_SIZE;

			this.img.onload = () => {
				this.visible = true;
			};

			this.setChat(chat);
		}

		setChat(chat) {
			this.chat = chat;

			if (chat == null) return;

			if (chat.pp && chat.pp.preview) {
				this.visible = false;
				this.img.src = chat.pp.preview;
			}

			this.chatName = chat.name ||
				(chat.contact != null ?
					(chat.contact.name || chat.contact.shortName || chat.contact.pushname ||
						chat.contact.phoneNumber) :
					"Unknown");
		}

		act(delta) {
			super.act(delta);
		}

		draw() {
			super.draw();

			if (this.chat == null) return;

			const radius = this.width / 2;

			const ctx = this.stage.ctx;

			ctx.save();
			ctx.beginPath();
			ctx.arc(this.x + radius, this.y + radius, radius, 0, Math.PI * 2);
			ctx.clip();
			ctx.drawImage(this.img, this.x, this.y, this.width, this.height);
			ctx.restore();

			ctx.font = "16px 'Arial'";
			ctx.textAlign = "center";
			ctx.fillStyle = "#fff";
			ctx.fillText(this.chatName, this.x + radius, this.y + this.height + 20);
		}
	}

	class Stage {
		viewport;
		ctx;
		
		#actors;

		constructor(viewport, canvasCtx) {
			this.viewport = viewport;
			this.ctx = canvasCtx;
			this.#actors = [];
		}

		get width() {
			return this.viewport.worldWidth;
		}

		get height() {
			return this.viewport.worldHeight;
		}

		addActor(actor) {
			let id;
			do {
				id = randomStr(24);
			} while (this.#actors.some((a) => a.id === id));
			actor.id = id;
			this.#actors.push(actor);
			actor.setStage(this);
		}

		removeActor(actor) {
			const index = this.#actors.findIndex((a) => a.id === actor.id);
			const [removedActor] = this.#actors.splice(index, 1);
			removedActor.setStage(null);
		}

		getActors() {
			return this.#actors;
		}

		act(delta) {
			for (const actor of this.#actors) {
				actor.act(delta);
			}
		}

		draw() {
			for (const actor of this.#actors) {
				if (actor.visible === true) {
					actor.draw();
				}
			}
		}
	}
	
	class Hero extends ChatActor {
		me;
		vx = 500;
		vy = 0;
		
		jumpVelocity = -500;

		onGround = false;
		groundY = 400;

		bulletCooldown = 0;

		constructor() {
			super(ME);
		}
		
		shoot(destX, destY) {
			const centerX = this.x + this.width / 2,
				  centerY = this.y + this.height / 2;
			const bullet = new TextBullet();
			bullet.setPosition(centerX, centerY);
			bullet.setSpawn(centerX, centerY);
			bullet.setDestination(destX, destY);
			this.stage.addActor(bullet);
		}

		act(delta) {
			const gp = input.gamepad && Object.values(input.gamepad.pads).find((pad) => pad != null);

			// left-right movement			
			let dir = 0;
			if (input.keyboard.keys.ArrowRight) {
				dir = 1;
			}
			if (input.keyboard.keys.ArrowLeft) {
				dir = -1;
			}
			if (gp?.axes?.[GAMEPAD_MAPPING.standard.axes.ls_x] != null) {
				// rounding to count for small errrors
				dir = Math.sign(Math.round(gp.axes[GAMEPAD_MAPPING.standard.axes.ls_x]));
			}
			this.x += delta * this.vx * dir;
			
			// limit the movementsx
			if (this.x <= 0 && dir < 0) {
				this.x = 0;
			}
			if (this.x + CHARACTER_SIZE >= this.stage.width && dir > 0) {
				this.x = this.stage.width - CHARACTER_SIZE;
			}
			
			// gravity & jump
			if (this.onGround) {
				if (gp?.buttons?. [GAMEPAD_MAPPING.standard.buttons.a]?.pressed) {
					this.vy = this.jumpVelocity;
					this.onGround = false;
				}
				if (input.keyboard.keys.Space) {
					this.vy = this.jumpVelocity;
					this.onGround = false;
				}
			}

			this.vy += GRAVITY * delta;
			this.y += this.vy * delta;

			if (this.y >= this.groundY) {
				this.y = this.groundY;
				this.vy = 0;
				this.onGround = true;
			}
			
			// shoot				
			this.bulletCooldown -= delta;

			if (this.bulletCooldown <= 0) {
				this.bulletCooldown = BULLET_COOLDOWN_TIME;
				
				if (input.mouse.left) {
					const dest = this.stage.viewport.unproject(input.mouse.x, input.mouse.y);
					this.shoot(dest.worldX, dest.worldY);
				}
				if (gp?.buttons?.[GAMEPAD_MAPPING.standard.buttons.rt]?.pressed) {
					const centerX = this.x + this.width / 2,
						  centerY = this.y + this.height / 2;
					this.shoot(
						centerX + gp.axes[GAMEPAD_MAPPING.standard.axes.rs_x],
						centerY + gp.axes[GAMEPAD_MAPPING.standard.axes.rs_y]
					);
				}
			}
		}
	}

	class EnemySystem extends Actor {
		enemyChats = [];
		currentActiveEnemies = 0;
		spawnCooldown = 0;

		constructor(enemyChats) {
			super();

			this.enemyChats = enemyChats;
		}

		spawnEnemy() {
			if (this.enemyChats.length === 0) return;

			const randomChat =
				this.enemyChats[Math.floor(Math.random() * this.enemyChats.length)];
			const enemy = new Enemy(randomChat, this);
			this.stage.addActor(enemy);
			enemy.setPosition(
				randomInt(0, this.stage.width - enemy.width),
				randomInt(0, this.stage.height - enemy.height),
			);
			this.currentActiveEnemies++;
			this.spawnCooldown = randomFloat(MIN_SPAWN_COOLDOWN, MAX_SPAWN_COOLDOWN);
		}

		act(delta) {
			super.act(delta);

			if (this.enemyChats.length === 0) return;

			if (this.currentActiveEnemies >= MAX_ENEMIES_IN_A_WAVE) {
				return;
			}

			this.spawnCooldown -= delta;
			if (this.spawnCooldown <= 0) {
				this.spawnEnemy();
			}
		}
	}

	class Enemy extends ChatActor {
		vx = 200;
		vy = 400;
		enemySystem = null;

		constructor(chat, enemySystem) {
			super(chat);
			this.enemySystem = enemySystem;
		}

		die() {
			this.enemySystem.currentActiveEnemies--; // todo: move this into the enemysystem code
		}

		act(delta) {
			super.act(delta);
			this.x += this.vx * delta;
			this.y += this.vy * delta;

			if (this.x <= 0 && this.vx < 0) {
				this.vx *= -1;
			}
			if (this.x + CHARACTER_SIZE >= this.stage.width && this.vx >= 0) {
				this.vx *= -1;
			}

			if (this.y <= 0 && this.vy < 0) {
				this.vy *= -1;
			}
			if (this.y + CHARACTER_SIZE >= this.stage.height && this.vy >= 0) {
				this.vy *= -1;
			}
		}
	}

	class TextBullet extends Actor {
		speed = 600;

		text = "a";

		spawnX = 0;
		spawnY = 0;
		destX = 0;
		destY = 0;

		constructor() {
			super();

			this.setText("a");
		}

		setSpawn(x, y) {
			this.spawnX = x;
			this.spawnY = y;
		}

		setDestination(x, y) {
			this.destX = x;
			this.destY = y;
		}

		setText(text) {
			this.text = text;
		}

		act(delta) {
			super.act(delta);

			const dx = this.destX - this.spawnX;
			const dy = this.destY - this.spawnY;
			const len = Math.sqrt(dx * dx + dy * dy);
			const ux = dx / len;
			const uy = dy / len;
			const vx = ux * this.speed;
			const vy = uy * this.speed;

			this.x += vx * delta;
			this.y += vy * delta;

			const ctx = this.stage.ctx;
			ctx.font = "16px 'Arial'";
			ctx.textAlign = "center";
			ctx.fillStyle = "yellow";
			const metrics = ctx.measureText(this.text);
			this.width = metrics.width;
			this.height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

			for (const actor of this.stage.getActors()) {
				if (actor instanceof Enemy) {
					const target = actor;

					if (
						(this.x >= target.x && this.x <= target.x + target.width) &&
						(this.y >= target.y && this.y <= target.y + target.height) // todo: extract to a bounding fn
					) {
						target.die();
						this.stage.removeActor(target);
					}
				}
			}

			if (
				this.x < 0 || this.x > this.stage.width || this.y < 0 ||
				this.y > this.stage.height
			) {
				this.stage.removeActor(this);
			}
		}

		draw() {
			super.draw();

			const ctx = this.stage.ctx;

			ctx.font = "16px 'Arial'";
			ctx.textAlign = "center";
			ctx.fillStyle = "yellow";
			ctx.fillText(this.text, this.x, this.y);
		}
	}

	function setupControlButtons() {
		const GAME_STYLESHEET_ID = "wac-stylesheet";
		let gameStylesheet = document.getElementById(GAME_STYLESHEET_ID);
		if (gameStylesheet == null) {
			gameStylesheet = document.createElement("style");
			gameStylesheet.id = GAME_STYLESHEET_ID;
			document.head.append(gameStylesheet);
		}
		gameStylesheet.textContent = GAME_STYLESHEET;

		const leftPanel = document.getElementById("side");

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

	function setupGameArea() {
		const leftPanel = document.getElementById("side");
		const rightPanel = leftPanel.parentElement.nextSibling;
		const bannerDiv = rightPanel.querySelector("div");
		bannerDiv.id = "wa-banner-div";

		for (const child of rightPanel.children) {
			if (child.id === bannerDiv.id) {
				continue;
			}
			rightPanel.removeChild(child);
		}

		const canvas = document.createElement("canvas");
		rightPanel.appendChild(canvas);

		canvas.style.visibility = "hidden";
		canvas.id = "game-canvas";
		canvas.style.position = "fixed";
		canvas.style.width = "100%";
		canvas.style.height = "100%";
		canvas.style.backgroundColor = CANVAS_BACKGROUND_COLOR;
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
	}

	setupControlButtons();

	function setCanvasVisible(visible) {
		const canvas = document.getElementById("game-canvas");
		const bannerDiv = document.getElementById("wa-banner-div");
		canvas.style.visibility = visible ? "visible" : "hidden";
		bannerDiv.style.visibility = visible ? "hidden" : "visible";
	}

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
		const ctx = canvas.getContext("2d"); // basically the (sprite)batch similar to libgdx
		const viewport = new FitViewport(800, 600);
		
		canvas.focus();
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		viewport.update(canvas.clientWidth, canvas.clientHeight);

		const stage = new Stage(viewport, ctx);
		
		input.activate();
		window.restoreListeners = input.deactivate;

		const chatsWithProfile = Array.from(CHATS.values())
			.filter((chat) => {
				if (chat.pp == null || chat.pp.preview == null) return false;
				return chat.name != null ||
					(chat.contact != null &&
						(chat.contact.name != null || chat.contact.shortName != null ||
							chat.contact.pushname != null));
			});

		const enemySystem = new EnemySystem(chatsWithProfile);
		stage.addActor(enemySystem);

		const hero = new Hero();
		hero.setPosition(100, stage.height - 300);
		stage.addActor(hero);

		function loop(frameTimestamp) {
			// fps & delta
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
			
			// update stuff
			input.update(delta); // (mainly for polling the gamepads if events are not supported)
			stage.act(delta);
			canvas.width = canvas.clientWidth;
			canvas.height = canvas.clientHeight;
			viewport.update(canvas.clientWidth, canvas.clientHeight);
			
			// drawing
			ctx.resetTransform();
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.save();
			ctx.translate(viewport.canvasX, viewport.canvasY);
			ctx.scale(viewport.scale, viewport.scale);

			ctx.strokeStyle = "blue";
			ctx.strokeRect(0, 0, viewport.worldWidth, viewport.worldHeight);

			stage.draw(); // finally draw
			
			ctx.restore();

			window.lastFrame = requestAnimationFrame(loop);
		}
		window.lastFrame = requestAnimationFrame(loop);
	}

	function play() {
		setupGameArea();
		window.gameCurrentState = GAME_STATES.LOADING_DATA;
		console.info("LOADING_DATA");
		setCanvasVisible(true);
		changeControlButtonIcon(SVG_ICONS.loaderCircle);
		const loaderIcon = controlButton.querySelector("svg.lucide");
		loaderIcon.style.animation = "spin 1s linear infinite";
		controlButton.firstChild.onclick = null;

		findRequiredWhatsappData()
			.then(({
				chats,
				me,
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
				if (typeof window.restoreListeners === "function") {
					window.restoreListeners();
				}
				window.gameCurrentState = GAME_STATES.PLAY;
				controlButton.firstChild.onclick = play;
				changeControlButtonIcon(SVG_ICONS.play);

				console.error(error);
				alert("Failed to load data. Please check console.");
			})
			.finally(() => {
				loaderIcon.style.animation = "";
			});
	}

	function stop() {
		if (typeof window.restoreListeners === "function") {
			window.restoreListeners();
		}
		setCanvasVisible(false);
		window.gameCurrentState = GAME_STATES.STOPPED;
		console.info("STOPPING");
		controlButton.firstChild.onclick = play;
		changeControlButtonIcon(SVG_ICONS.play);
		
		const canvas = document.getElementById("game-canvas");
		const ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		CHATS = null;
		ME = null;

		if (window.lastFrame == null) {
			console.error("No game to stop??!");
			return;
		}
		cancelAnimationFrame(window.lastFrame);
		window.lastFrame = null;
	}
}

console.clear();
await run();

async function findRequiredWhatsappData() {
	// 	await new Promise((res) => setTimeout(res, 10000));
	const stored = await getIndexedDbData("model-storage");

	const pp = new Map();
	for (const ppThumb of stored.profilePicThumbs) {
		pp.set(ppThumb.id, {
			preview: ppThumb.previewEurl,
			full: ppThumb.eurl,
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
			// todo: check why this fails
			chatObject.contact = {
				id: contact.id,
				phoneNumber: Number(id),
				name: contact.name,
				shortName: contact.shortName,
				pushname: contact.pushname,
			};
		} else if (type === "group") {
			const participants = participantsData[chat.id];
			if (participants == null) {
				throw new Error("should not be null!");
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
		me,
	};
}

function readIndexedDb(dbName) {
	return resolveRequest(indexedDB.open(dbName));
}

async function findAuthWALid() {
	const WA_LID_VALUE_FORMAT = /\d+:\d+@lid/;
	const db = await readIndexedDb("wawc");
	const transaction = db.transaction("user", "readonly");
	const userStore = transaction.objectStore("user");
	const {
		value,
	} = await resolveRequest(userStore.get("WALid"));
	const parsedStr = JSON.parse(value);
	if (!WA_LID_VALUE_FORMAT.test(parsedStr)) {
		throw new Error("Unhandled WALid format: " + parsedStr);
	}
	return parsedStr;
}

async function getIndexedDbData(dbName) {
	const db = await readIndexedDb(dbName);
	const transaction = db.transaction(db.objectStoreNames, "readonly");
	const chats = await getStoreData(transaction, "chat");
	const profilePicThumbs = await getStoreData(transaction, "profile-pic-thumb");
	// const messages = await getStoreData(transaction, "message");
	const contacts = await getStoreData(transaction, "contact");
	const participants = await getStoreData(transaction, "participant");
	// const deviceList = await getStoreData(transaction, "device-list");

	const authWALid = await findAuthWALid();
	const meJid = authWALid.replace(/:\d+/, "");

	const meContact = contacts.find((contact) => contact.id === meJid);
	if (meContact == null) {
		throw new Error("What!");
	}
	const mePhoneNumber = meContact.phoneNumber;

	return {
		chats,
		profilePicThumbs,
		contacts,
		participants,
		me: {
			jid: meJid,
			phoneNumber: mePhoneNumber,
		},
	};
}

function resolveRequest(request) {
	return new Promise((resolve, reject) => {
		request.onerror = (event) => reject(event);
		request.onsuccess = () => resolve(request.result);
	});
}

function getStoreData(transaction, storeName) {
	return resolveRequest(transaction.objectStore(storeName).getAll());
}

// snippet wrote for quickly finding which store has useful information by searching with some key
// for (const {
// 		name: dbName
// 	} of await indexedDB.databases()) {
// 	if (dbName === "model-storage") continue;
// 	const db = await readIndexedDb(dbName);
// 	if (db.objectStoreNames.length === 0) continue;
// 	const transaction = db.transaction(db.objectStoreNames, "readonly");
// 	for (const name of db.objectStoreNames) {
// 		if (["message", "sync-actions", "reactions", "chat", "message-info", "participant", "poll-votes", "message-orphans", "message-association", "group-metadata", "orphan-revoke", "group-invite-v4"].includes(name)) continue;
// 		const data = await getStoreData(transaction, name);
// 		for (const dd of data) {
// 			if (JSON.stringify(dd).includes("")) {
// 				console.log(name);
// 				console.log(dd);
// 			}
// 		}
// 	}
// }