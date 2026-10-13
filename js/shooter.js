//シューティングゲームのようなもの
//
//by はぐれヨウマ

{//Javascriptメモ
    //thisは.の左のオブジェクトのこと！thisを固定するにはbindやCallする　アロー関数=>のthisは変わらないよ
    //ゲッター・セッターはアロー関数=>に未対応
    //スプレッド構文[1,...配列A,2...配列B]
    //ジェネレーター構文*method(){}関数を中断と再開できる アロー関数=>はない
    //jsファイルを後から読み込むには、script要素を追加してonloadイベントで待つのがいい？
    //a=yield 1;→b=generator.next();でbに1が返ってきて、続けてgenerator.next(2)でaに2が返ってくる　yieldの外と変数のやり取りができる
    //非同期 new Promise((resolve){非同期にやりたいこと;resolve();}).then(){非同期が終わってから呼ばれる};
    //async関数はresolveが呼んであるPromiseオブジェクトをreturnするよ
    //webフォントの読み込み待ちはonloadイベントでできないみたいなのでWebFontLoaderを使いました
}
'use strict';
console.clear();

import { cfg, EMOJI, Game, Util, Rect, Mono, Coro, wait, waitForFrag, waitForTime, waitForTimeOrFrag, repeatFor, Child, Pos, Scale, Move, Lissajous, Anime, Ease, Guided, Collision, Brush, Tofu, Picture, E, Moji, Label, Particle, Gauge, Watch, Color, through, Afterimage } from "./youma.js";
class Unit {//ユニットコンポーネント
    static requires = [Coro, Pos, Scale, Move, Lissajous, Collision, Color];
    constructor(owner) {
        this.status = new UnitStatus();
        this.action = new UnitAction(owner);
        this.powerup = new UnitPowerup(owner);
        this.reset();
    }
    reset() {
        this.data = this.scene = this.onDamage = this.onDefeat = undefined;
        this.coroSpawn = this.coroSpawnDefault;
        this.coroDefeat = this.coroDefeatDefalut;
        this.status.reset();
        this.action.reset();
        this.powerup.reset();
    }
    set(data, scene) {
        this.reset();
        this.scene = scene;
        if (!data) return;
        this.setStatus(data);
        this.owner.addMix(OutToRemove, true);
        this.owner.outtoremove.isOutOfScreenToRemove = data.isOutOfScreenToRemove;
        this.owner.coro.start(this.coroSpawn(), 'main');
    }
    setStatus(data) {
        this.data = data;
        this.status.set(data.hp);
    }
    resetHp() {
        this.status.hp = this.status.hpMax;
    }
    isDamage() {
        return this.owner.outtoremove.hasEnteredScreen && this.status.hp > 0;
    }
    damage(damage) {
        if (this.status.invincible) return;
        if (this.status.damage(damage)) {
            this.owner.color.flash('crimson');
            this.onDamage?.();
            return;
        }
        this.defeat();
    }
    playEffect(name, x, y) {
        let { emoji, color, isRandomAngle, count, timeFactor, rotate, isConverge } = datas.unit.effects[name] ??= datas.unit.star2;
        if (!color || color === '') color = this.data.color;
        const size = this.data.size;
        const particleSize = size * (emoji === '' ? 0.2 : 0.5);
        const time = size * timeFactor;
        this.scene.effect.emittCircle(count, size * 1.5, time, particleSize, color, x, y, isConverge, { emoji, isRandomAngle, rotate });
        return time;
    }
    playSpawnEffect(x = this.owner.pos.linkX, y = this.owner.pos.linkY) {
        return this.playEffect(datas.unit.defaultSpawnEffect, x, y);
    }
    playDefeatEffect(x = this.owner.pos.linkX, y = this.owner.pos.linkY) {
        return this.playEffect((!this.data.defeatEffect || this.data.defeatEffect === '') ? datas.unit.defaultDefeatEffect : this.data.defeatEffect, x, y);
    }
    *coroSpawnDefault() {
        if (this.owner.coroAction) yield* this.owner.coroAction();
    }
    defeat() {
        this.owner.coro.stop('invincible');
        this.owner.coro.start(this.coroDefeat(), 'main');
    }
    *coroDefeatDefalut() {
        this.playDefeatEffect();
        this.defeatRequied();
        this.owner.remove();
    }
    defeatRequied() {//撃破時に呼び出す
        this.owner.color.restore();
        this.scene.addPoint(this.data.point);
        this.onDefeat?.();
    }
    enableInvincible(time = 0, func = undefined) {
        this.status.invincible = true;
        this.owner.color.blink(0.03);
        if (time <= 0 && !func) return;
        this.owner.coro.start(this.coroInvincible(time, func), 'invincible');
    }
    disableInvincible() {
        if (!this.status.invincible) return;
        this.owner.color.restore();
        this.status.invincible = false;
    }
    *coroInvincible(time, func = undefined) {
        yield undefined;
        yield* waitForTimeOrFrag(time, func);
        this.disableInvincible();
    }
    get hpRatio() { return this.status.hp / this.status.hpMax; };
    update() {
        this.action.update();
    }
}
class UnitStatus {
    constructor() {
        this.reset();
    }
    reset() {
        this.set();
    }
    set(hp = 1) {
        this.hp = this.hpMax = hp;
        this.setExtraHp();
        this.invincible = false;
    }
    setExtraHp(hp = 0) {
        this.exhp = this.exhpMax = hp;
    }
    isExtraHp() { return this.exhp > 0 }
    damage(damage) {
        this.exhp -= damage;
        if (this.exhp >= 0) return true;
        this.hp += this.exhp;
        this.exhp = 0;
        if (this.hp > 0) return true;
        this.hp = 0;
        return false;
    }
}
class UnitPowerup {
    constructor(owner) {
        this.owner = owner;
        this.map = new Map();
    }
    reset() {
        for (const powerup of this.map.values()) {
            powerup.gauge.remove();
        }
        this.map.clear();
    }
    has(name) { return this.map.has(name); }
    get(name) { return this.map.get(name) }
    add(name, param) {
        const { applyfunc = undefined, conditionfunc = undefined, removefunc = undefined, timelimit = 0, color = '#ffffff', max = 0, watch = undefined } = param;
        let powerup = this.map.get(name);
        if (powerup) {
            powerup.param.removefunc?.();
            powerup.gauge?.remove();
        } else {
            powerup = { param, gauge: undefined, wait: undefined };
            this.map.set(name, powerup);
        }
        powerup.gauge = max > 0 ? this.createGauge(name, 40, 6, color, max, watch) : undefined;
        this._updateGaugeY();
        applyfunc?.();
        let wait = undefined;
        if (timelimit > 0) {
            wait = waitForTime(timelimit);
            this.owner.coro.start(function* () {
                yield* wait;
                removefunc?.();
                this.remove(name);
            }.call(this), name);
        }
        powerup.wait = wait;
    }
    condition(name) {
        const p = this.map.get(name);
        if (!p) return;
        if (!p.param.conditionfunc || p.param.conditionfunc()) return;
        this.remove(name);
    }
    remove(name) {
        const powerup = this.map.get(name);
        if (!powerup) return;
        this.removeGauge(name);
        powerup.param.removefunc?.();
        this.map.delete(name);
    }
    createGauge(name, width, height, color, max, watch) {
        this.map.get(name)?.gauge?.remove();
        const gauge = new Gauge();
        gauge.set(0, 0, width, height, color, 0, max, watch);
        gauge.pos.align = 1;
        gauge.pos.valign = 0;
        gauge.pos.parent = this.owner;
        this.owner.unit.scene.charaUi.child.add(gauge);
        return gauge;
    }
    removeGauge(name) {
        const powerup = this.map.get(name);
        if (!powerup?.gauge) return;
        powerup.gauge.remove()
        this._updateGaugeY();
    }
    _updateGaugeY() {
        let y = this.owner.pos.height * 0.5;
        for (const powerup of this.map.values()) {
            if (!powerup.gauge) continue;
            const pos = powerup.gauge.pos;
            pos.y = y;
            y += pos.height + 1;
        }
    }
}
class UnitAction {
    constructor(owner) {
        this.owner = owner;
        this.reset();
    }
    reset() {
        this.setGuided(0, 0, undefined, 0);
    }
    setGuided(vx, vy, target, speed) {
        this.target = target;
        this.horming = speed;
        this.baseX = vx;
        this.baseY = vy;
        this.targetBeforeX = this.targetBeforeY = 0;
    }
    update() {
        if (this.horming !== 0 && this.target.isExist) {
            const pos = this.owner.pos;
            const tPos = this.target.pos;
            let tx = this.targetBeforeX;
            let ty = this.targetBeforeY;
            if (this.target.isExist) {
                tx = this.targetBeforeX = tPos.linkX;
                ty = this.targetBeforeY = tPos.linkY;
            }
            let x = tx - pos.linkX;
            let y = ty - pos.linkY;
            let distance = Util.distance(x, y);
            if (distance > 0) {
                x /= distance;
                y /= distance;
            }
            let speed = this.horming + (distance * 0.25);
            let vx = this.baseX;
            let vy = this.baseY;
            if (this.baseX * x >= 0) vx += x * speed;
            if (this.baseY * y >= 0) vy += y * speed;
            pos.x += vx * Game.delta;
            pos.y += vy * Game.delta;
        }
    }
}
class OutToRemove {//画面外に出ると削除コンポーネント
    constructor() {
        this.reset();
    }
    reset() {
        this.isOutOfScreenToRemove = false;
        this.hasEnteredScreen = false;
    }
    update() {
        if (Game.screen.isOverflowRange(this.owner.pos.rect)) this.owner.remove();
        if (!this.hasEnteredScreen && !Game.screen.isOut(this.owner.pos.rect)) this.hasEnteredScreen = true;
        if (this.hasEnteredScreen && this.isOutOfScreenToRemove && Game.screen.isOut(this.owner.pos.rect)) this.owner.remove();
    }
}
class Player extends Mono {//自機
    constructor() {
        super(Unit, Moji);
    }
    set(scene) {
        const data = datas.player.data;
        this.unit.set(data, scene);
        this.unit.onDamage = () => {
            this.unit.enableInvincible(datas.player.damagedInvincibilityTime);//被弾時の無敵時間
            this.unit.powerup.condition('powerupShield1');
        }
        this.unit.onDefeat = () => {
            scene.swapPlayerDammy();
            shared.playdata.total.remains--;
            if (shared.playdata.total.remains < 0) return;
            this.unit.scene.coro.start(function* () {
                yield* waitForTime(1);
                scene.playerRespawn();
            }.call(this));
        }
        this.moji.set(Util.parseUnicode(data.char), 0, 0, { size: data.size, color: data.color, font: cfg.font.emoji.name, align: 1, valign: 1, useImagecache: true });
        this.collision.set(this.pos.width * 0.2, this.pos.height * 0.2);
        this.resetPos();
    }
    resetPos() {
        this.pos.x = Game.width * 0.5;
        this.pos.y = (Game.height - this.pos.height * 0.5) - (Game.height * 0.05);
    }
    resetCoro() {
        this.coro.start(this.coroShotOnce(), 'shot');
        this.coro.start(this.coroBomb(), 'bomb');
    }
    respawnRequied() {
        this.unit.playSpawnEffect();
        this.unit.enableInvincible(datas.player.damagedInvincibilityTime);//リスポーン後の無敵時間
    }
    postUpdate() {
        const halfX = this.pos.width * 0.5;
        const halfY = this.pos.height * 0.5;
        this.pos.x = Util.clamp(halfX, this.pos.x, Game.width - halfX);
        this.pos.y = Util.clamp(halfY, this.pos.y, Game.height - halfY);
    }
    draw(ctx) {
        ctx.save();
        const pos = this.pos;
        const x = this.pos.left;
        const y = pos.top;
        ctx.fillStyle = 'yellow';
        ctx.globalAlpha = this.color.alpha;
        ctx.fillRect(x + 31, y + 5, 10, 8);
        ctx.restore();
    }
    *coroAction() {
        this.resetCoro();
        while (true) {
            yield undefined;
            this.move.vx = this.move.vy = 0;
            if (Game.input.isDown('left')) this.move.vx = -datas.player.moveSpeed;
            if (Game.input.isDown('right')) this.move.vx = datas.player.moveSpeed;
            if (Game.input.isDown('up')) this.move.vy = -datas.player.moveSpeed;
            if (Game.input.isDown('down')) this.move.vy = datas.player.moveSpeed;
            if (this.move.vx !== 0 && this.move.vy !== 0) {
                this.move.vx *= Util.naname;
                this.move.vy *= Util.naname;
            }
        }
    }
    switchWeapon(weaponName, timelimit = 0) {
        if (timelimit === 0) {
            this.unit.powerup.add('powerupShot', {
                applyfunc: () => { this.coro.start(this[weaponName](), 'shot'); },
            });
            return;
        }
        this.unit.powerup.add('powerupShot', {
            applyfunc: () => { this.coro.start(this[weaponName](), 'shot'); },
            removefunc: () => { this.coro.start(this.coroNormalShot(), 'shot'); },
            timelimit: timelimit,
            color: datas.color.bullet.PlayerPower1,
            max: timelimit,
            watch: () => this.unit.powerup.get('powerupShot').wait.state.time
        });
    }
    equipShield(hp) {
        this.unit.powerup.add('powerupShield1', {
            applyfunc: () => { this.unit.status.setExtraHp(hp); },
            conditionfunc: () => { return this.unit.status.isExtraHp() },
            removefunc: () => { this.unit.status.setExtraHp(); },
            timelimit: 0,
            color: datas.color.item.playerShield1,
            max: hp,
            watch: () => { return this.unit.status.exhp; }
        });
    }
    *coroShotOnce() {
        yield* waitForTime(0.2);
        yield* this.coroNormalShot();
    }
    *coroNormalShot() {
        const shot = (xCollect, deg) => {
            this.unit.scene.playerbullets.multiWay(this.pos.x + xCollect, this.pos.y, { deg: deg, count: 1, speed: datas.player.bulletSpeed, color: datas.color.bullet.PlayerNormal, point: 100 });
        }
        while (true) {
            yield undefined;
            if (!Game.input.isDown('z')) {
                continue;
            }
            shot(10, 90);
            shot(10, 85);
            shot(-10, 90);
            shot(-10, 95);
            yield* waitForTime(0.125);
        }
    }
    *coroPowerupShot1() {
        const shot = (xCollect, deg) => {
            this.unit.scene.playerbullets.multiWay(this.pos.x + xCollect, this.pos.y, { deg: deg, count: 1, speed: datas.player.bulletSpeed, color: datas.color.bullet.PlayerPower1, point: 100 });
        }
        while (true) {
            yield undefined;
            if (!Game.input.isDown('z')) {
                continue;
            }
            shot(10, 90);
            shot(10, 85);
            shot(10, 80);
            shot(10, 75);
            shot(-10, 90);
            shot(-10, 95);
            shot(-10, 100);
            shot(-10, 105);
            yield* waitForTime(0.125);
        }
    }
    *coroBomb() {
        yield* waitForTime(0.4);
        while (true) {
            yield undefined;
            if (shared.playdata.total.bomb <= 0) continue;
            if (!Game.input.isDown('x')) {
                continue;
            }
            shared.playdata.total.bomb--;
            this.unit.scene.playerbomb.drop(this.pos.linkX, this.pos.linkY);
            yield* waitForTime(1);
        }
    }
}
class Spawner {//敵キャラ出現  
    constructor(scene) {
        this.scene = scene;
    }
    spawn(container, type, x, y, data, pattern, bullets, scene, parent, isPlaySpawnEffect) {
        const bad = container.child.pool(type).set(x, y, data, pattern, bullets, scene, parent);
        if (isPlaySpawnEffect) bad.unit.playSpawnEffect();
        return bad;
    }
    formation(type, formationType, data, pattern, container, bullets, scene, { x = -1, y = -1, count = 1, space = -1, parent = undefined, isPlaySpawnEffect = false, } = {}) {
        //xまたはyは-1にするとランダムになるよ
        const size = data.size;
        space = space > 0 ? space : size + size * 0.25;
        return this[formationType]({ x, y, count, space, size }).map(([bx, by]) => this.spawn(container, type, bx, by, data, pattern, bullets, scene, parent, isPlaySpawnEffect));
    }
    within({ x, y, size } = {}) {
        if (x < 0) x = Util.rand(Game.width - size) + size * 0.5;
        if (y < 0) y = Util.rand(Game.width - size) + size * 0.5;
        return [[x, y]];
    }
    topsingle({ x, size } = {}) {
        if (x < 0) x = Util.rand(Game.width - size) + size * 0.5;
        return [[x, -size]];
    }
    circle({ count, space, size } = {}) {
        if (space <= 0) space = size * 2;
        const deg = 360 / count;
        const poss = [];
        for (let i = 0; i < count; i++) {
            poss.push([Util.degToX(deg * i) * space, Util.degToY(deg * i) * space]);
        }
        return poss;
    }
    v({ x, count, size, space, option = false } = {}) {//option:上下逆
        const y = -size;
        const poss = [];
        const row = Math.floor(count * 0.5) + 1;
        if (x < 0) {
            const w = space * (row * 2 - 1);
            x = Util.rand(Game.width - w) + w * 0.5;
        }
        for (let i = 0; i < row; i++) {
            const col = option ? (row - 1) - i : i;
            if (col !== 0) poss.push([x - (space * col), y - space * i]);
            poss.push([x + (space * col), y - space * i]);
        }
        return poss;
    }
    delta({ x, count, size, space } = {}) {
        return this.v({ x, count, size, space, option: true });
    }
    tri({ x, count, size, space, option = false } = {}) {//option:上下逆
        const y = -size;
        const poss = [];
        const row = Math.floor(count * 0.5) + 1;
        if (x < 0) {
            const w = space * (row * 2 - 1);
            x = Util.rand(Game.width - w) + w * 0.5;
        }
        for (let i = 0; i < row; i++) {
            const k = option ? (row - 1) - i : i;
            const col = k * 2 + 1;
            for (let j = 0; j < col; j++) {
                poss.push([x - (space * k) + (space * j), y - space * i]);
            }
        }
        return poss;
    }
    inverttri({ x, count, size, space } = {}) {
        return this.tri({ x, count, size, space, option: true });
    }
    trail({ x, count, size, space }) {
        const y = -size;
        const poss = [];
        if (x < 0) x = Util.rand(Game.width - size) + size * 0.5;
        for (let i = 0; i < count; i++) {
            poss.push([x, y - space * i]);
        }
        return poss;
    }
    abrest({ x, count, size, space }) {
        const y = -size;
        const poss = [];
        if (x < 0) x = Util.rand(Game.width - space * count) + size * 0.5;
        for (let i = 0; i < count; i++) {
            poss.push([x + space * i, y]);
        }
        return poss;
    }
    left({ y, count, size, space, option = false }) {//option:右
        const poss = [];
        if (y < 0) y = Util.rand(Game.width - space * count) + size * 0.5;
        const x = option ? Game.width + size : -size;
        const w = Math.sign(x) * size * 0.5;
        for (let i = 0; i < count; i++) {
            poss.push([x + w * i, y + space * i]);
        }
        return poss;
    }
    right({ y, count, size, space }) {
        return this.left({ y, count, size, space, option: true });
    }
    randomtop({ size, count, space, option = false }) {//option:横方向
        const y = -size;
        const poss = [];
        const max = Math.floor(option ? (Game.height * 0.6) / space : (Game.width / space) - 1);
        const ps = Util.randomArray(max, Util.rand(Math.min(count, max), 1));
        for (const p of ps) {
            if (!option) {
                poss.push([space * (p + 1), y + -Util.rand(size)]);
            } else {
                const isRight = Util.rand(1);
                poss.push([isRight ? Game.width + size : -size + (isRight === 1 ? 1 : -1) * Util.rand(size), space * (p + 1)]);
            }
        }
        return poss;
    }
    randomside({ size, count, space }) {
        return this.randomtop({ size, count, space, option: true });
    }
}
class Baddie extends Mono {//敵キャラ
    static spawnType = { within: 0, top: 1, left: 2, right: 3 };
    constructor() {
        super(Unit, Anime, Moji);
        this.reset();
    }
    reset() {
        this.routine = undefined;//unitクラスに移動する？
    }
    set(x, y, data, pattern, bullets, scene, parent) {
        this.routine = this.routines[data.routine](this, pattern, bullets, scene);
        this.pos.parent = parent;
        this.moji.set(Util.parseUnicode(data.char), x, y, { size: data.size, color: data.color, font: cfg.font.emoji.name, align: 1, valign: 1, useImagecache: true });
        this.collision.set(this.pos.width, this.pos.height);
        this.unit.set(data, scene);
        this.unit.onDefeat = () => {
            scene.addKo();
        }
        return this;
    }
    setAnime() {
        const size = this.pos.width * 0.2;
        this.lissajous.set(3, 2, size, size, { cycle: 4, phase: Util.rand(3) });
    }
    *coroAction() {
        yield* this.routine;
    }
    whichSpawnType() {
        let result = Baddie.spawnType.within;
        if (this.pos.right < 0) {
            result = Baddie.spawnType.left;
        } else if (this.pos.left >= Game.width) {
            result = Baddie.spawnType.right;
        } else if (this.pos.bottom < 0) {
            result = Baddie.spawnType.top;
        }
        return result;
    }
    *routineBasicShot(user, pattern, shot) {
        yield* waitForTime(Util.rand(60) * Game.delta); //ランダムで最大1秒まで待機
        while (true) {
            if (Game.screen.isOut(user.pos.rect)) yield undefined; //画面外にいるなら射撃しない
            yield* shot(); //射撃
        }
    }
    *routineBasic(user, pattern, moveSpeed, shot) {
        user.setAnime();
        //射撃
        if (shot) user.coro.start(user.routineBasicShot(user, pattern, shot));
        //移動
        const spawnType = user.whichSpawnType();
        switch (spawnType) {
            case Baddie.spawnType.within:
                break;
            case Baddie.spawnType.top:
                user.move.set(0, moveSpeed);
                break;
            case Baddie.spawnType.left:
                user.move.set(moveSpeed, 0);
                break;
            case Baddie.spawnType.right:
                user.move.set(-moveSpeed, 0);
                break;
        }
    }
    routines = {
        bomb: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            user.move.set(0, moveSpeed);
            user.unit.onDefeat = () => {
                shared.playdata.total.bomb++;
            };
        },
        powerupShot1: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            user.move.set(0, moveSpeed);
            user.unit.onDefeat = () => {
                scene.player.switchWeapon('coroPowerupShot1', 10);
            };
        },
        powerupShield1: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            user.move.set(0, moveSpeed);
            user.unit.onDefeat = () => {
                scene.player.equipShield(2);
            };
        },
        crow: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            const shot1 = function* () {
                bullets.multiWay(user.pos.linkX, user.pos.linkY, { count: 1, color: datas.color.bullet.enemyNormal1 });
                yield* waitForTime(3);
            };
            yield* user.routineBasic(user, pattern, moveSpeed, shot1);
        },
        dove: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            const shot1 = function* () {
                bullets.multiWay(user.pos.x, user.pos.y, { count: 2, color: datas.color.bullet.enemyNormal2 });
                yield* waitForTime(3);
            };
            yield* user.routineBasic(user, pattern, moveSpeed, shot1);
        },
        crossdove: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            const shot1 = function* () {
                bullets.multiWay(user.pos.x, user.pos.y, { count: 2, color: datas.color.bullet.enemyNormal2 });
                yield* waitForTime(3);
            };
            const spawnType = user.whichSpawnType();
            user.setAnime();
            switch (spawnType) {
                case Baddie.spawnType.left:
                    yield* user.move.relative(0 - user.pos.x, 0, moveSpeed * 2);
                    yield* user.move.relative(Game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sineout, min: 0.5 });
                    user.coro.start(user.routineBasicShot(user, pattern, shot1));
                    yield* user.move.relative(Game.width * 0.4, 0, moveSpeed, { easing: Ease.linear, min: 0 });
                    yield* user.move.relative(Game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sinein, min: 0.5 });
                    yield* user.move.relative(Game.screen.range + user.pos.width, 0, moveSpeed * 2);
                    break;
                case Baddie.spawnType.right:
                    yield* user.move.relative(Game.width - user.pos.x, 0, moveSpeed * 2);
                    yield* user.move.relative(-Game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sineout, min: 0.5 });
                    user.coro.start(user.routineBasicShot(user, pattern, shot1));
                    yield* user.move.relative(-Game.width * 0.4, 0, moveSpeed, { easing: Ease.linear, min: 0 });
                    yield* user.move.relative(-Game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sinein, min: 0.5 });
                    yield* user.move.relative(-(Game.screen.range + user.pos.width), 0, moveSpeed * 2);
                    break;
                default:
            }
        },
        bigcrow: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            const shot1 = function* () {
                const x = user.pos.linkX, y = user.pos.linkY;
                const r = Util.rand(100);
                if (r > 50) {
                    const deg = Util.xyToDeg(scene.player.pos.x - x, scene.player.pos.y - y); bullets.multiWay(x, y, { deg, count: 5, color: datas.color.bullet.enemyAim });
                } else {
                    bullets.multiWay(x, y, { count: 5, color: datas.color.bullet.enemyNormal1 });
                }
                yield* waitForTime(3);
            }
            yield* user.routineBasic(user, pattern, moveSpeed, shot1);
        },
        obake: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            user.unit.action.setGuided(0, 100, scene.player, moveSpeed);
        },
        boss1: function* (user, pattern, bullets, scene) {
            //ボス初期化
            user.setAnime();
            //取り巻き召喚
            const minionName = 'minioncrow';
            const minionData = datas.baddies[minionName];
            let minions = [];
            const removeMinions = () => {
                for (const minion of minions) minion?.remove();
                minions = [];
            };
            const killMinions = () => {
                for (const minion of minions) minion?.unit.defeat();
                minions = [];
            };
            const initMinion = (minions, index) => {
                const unit = minions[index].unit;
                unit.onDefeat = () => {
                    minions[index] = undefined;
                };
            };
            const summonMinions = function* (name, count, space) {
                //取り巻きの最大数が違うなら新規に呼び出す
                if (minions.length !== count) {
                    removeMinions();
                    minions = scene.spawner.formation(Baddie.name, 'circle', minionData, -1, scene.baddies, bullets, scene, { count, space, parent: user, isPlaySpawnEffect: true });
                    for (let i = 0; i < minions.length; i++) {
                        initMinion(minions, i);
                    }
                    return;
                }
                //倒された取り巻きだけ再召喚
                let degOffset = 0;
                const baseDeg = 360 / count;
                for (let i = 0; i < minions.length; i++) {
                    const minion = minions[i];
                    if (!minion) continue;
                    degOffset = Util.xyToDeg(minion.pos.x, minion.pos.y) - (i * baseDeg);
                    break;
                }
                let time = 0;
                for (let i = 0; i < minions.length; i++) {
                    const minion = minions[i];
                    if (minion) continue;
                    const deg = i * baseDeg + degOffset;
                    minions[i] = scene.spawner.spawn(scene.baddies, Baddie.name, Util.degToX(deg) * space, Util.degToY(deg) * space, minionData, 0, bullets, scene, user, true);
                    initMinion(minions, i);
                }
                yield* waitForTime(time * 0.5);
            };
            //撃破エフェクト
            user.unit.coroDefeat = function* () {
                killMinions();
                user.coro.stopAll('main');
                user.unit.defeatRequied();
                const pos = user.pos;
                for (let i = 0; i < 16; i++) {
                    user.unit.playDefeatEffect(pos.left + Util.rand(pos.width), pos.top + Util.rand(pos.height));
                    yield* waitForTime(1 / 8);
                }
                user.remove();
            };
            //弾パターン
            const circleShot = function* (x = undefined, y = undefined) {
                x ??= user.pos.x, y ??= user.pos.y;
                const count = 24;
                for (let i = 0; i < 6; i++) {
                    bullets.circle(x, y, { count: count, color: datas.color.bullet.enemyNormal1, offset: ((360 / count) * 0.5) * (i % 2), speed: 150 });
                    yield* waitForTime(0.5);
                }
            };
            const spiralShot = function* (x = undefined, y = undefined) {
                x ??= user.pos.x, y ??= user.pos.y;
                const deg = 360 / 6;
                let degOffset = 0;
                for (let i = 0; i < 16; i++) {
                    for (let j = 0; j < 6; j++) {
                        bullets.multiWay(x, y, { deg: (deg * j) + degOffset, count: 1, speed: 100, color: datas.color.bullet.enemyNormal2 });
                    }
                    yield* waitForTime(0.2);
                    degOffset += 18;
                }
            };
            const ringShot = function* () {
                const speed = 500;
                const bulletlist = [
                    ...bullets.circle(user.pos.left, user.pos.y, { speed: 250, count: 12, color: datas.color.bullet.enemyAim, isOutOfScreenToRemove: false }),
                    ...bullets.circle(user.pos.right, user.pos.y, { speed: 250, count: 12, color: datas.color.bullet.enemyAim, isOutOfScreenToRemove: false })
                ];
                yield* waitForTime(0.5);
                for (const b of bulletlist) {
                    const [x, y] = Util.normalizeXY(scene.player.pos.x - b.pos.x, scene.player.pos.y - b.pos.y);
                    b.move.set(x * speed, y * speed);
                }
                yield* waitForTime(1);
            };
            const ringShotRepeat = function* () {
                while (true) {
                    yield* ringShot();
                    yield* waitForTime(2);
                }
            };
            const fanShot = function* (count = 3, rangeDeg = 15, radiantSpeed = 180, bulletSpeed = 200) {
                const x = user.pos.x, y = user.pos.y;
                const timeOfs = Game.time.sec;
                for (let i = 0; i < 10; i++) {
                    bullets.multiWay(x, y, { deg: 270 + (rangeDeg * Util.degToX((Game.time.sec - timeOfs) * radiantSpeed)), count: count, speed: bulletSpeed, color: datas.color.bullet.enemyNormal3 });
                    yield* waitForTime(0.3);
                }
            };
            const fanShotParallel = function* (count = 3, rangeDeg = 15, radiantSpeed = 180, bulletSpeed = 200) {
                const lx = user.pos.left, rx = user.pos.right, y = user.pos.y;
                const timeOfs = Game.time.sec;
                for (let i = 0; i < 10; i++) {
                    bullets.multiWay(lx, y, { deg: 270 + (rangeDeg * Util.degToX((Game.time.sec - timeOfs) * radiantSpeed)), count: count, speed: bulletSpeed, color: datas.color.bullet.enemyNormal3 });
                    bullets.multiWay(rx, y, { deg: 270 + (rangeDeg * Util.degToX((Game.time.sec - timeOfs) * radiantSpeed)), count: count, speed: bulletSpeed, color: datas.color.bullet.enemyNormal3 });
                    yield* waitForTime(0.3);
                    yield* waitForTime(0.3);
                }
                // for (let i = 0; i < 18; i++) {
                //     bullets.multiWay(lx, y, { deg: 260 + (rangeDeg * Util.degToX((Game.time.sec - timeOfs) * radiantSpeed)), space: 7, count: count, speed: bulletSpeed, color: datas.color.bullet.enemyNormal3 });
                //     bullets.multiWay(rx, y, { deg: 280 + (rangeDeg * Util.degToX((Game.time.sec - timeOfs) * radiantSpeed)), space: 7, count: count, speed: bulletSpeed, color: datas.color.bullet.enemyNormal3 });
                //     yield* waitForTime(0.125);
                // }
            };
            const guidedShot = function* () {
                for (let j = 0; j < 3; j++) {
                    bullets.multiWay(user.pos.x, user.pos.y, { deg: 90, space: 25, count: 4, speed: 500, firstSpeed: 0, accelTime: 3, color: datas.color.bullet.enemyGuided, guided: scene.player, guidedSpeed: 1.75 });
                    yield* waitForTime(1);
                }
            };
            const multiwayShot = function* () {
                while (true) {
                    yield undefined;
                    for (let i = 0; i < 8; i++) {
                        bullets.multiWay(user.pos.x, user.pos.y, { count: 3, speed: 400, color: datas.color.bullet.enemyNormal2 });
                        yield* waitForTime(0.05);
                    }
                    yield* waitForTime(2);
                }
            };
            //ボスの移動
            const resetPos = function* () {
                yield* user.move.to(Game.width * 0.5, Game.height * 0.3, 200, { easing: Ease.sineInOut });
            };
            const randPos = function* () {
                const x = Util.rand(Game.width - user.pos.width) + (user.pos.width * 0.5);
                const y = Util.rand((Game.height * 0.4) - user.pos.height) + (user.pos.height * 0.5);
                yield* user.move.to(x, y, 200, { easing: Ease.sineInOut });
            };
            //ここからボスの動作
            user.unit.enableInvincible();//登場時無敵
            yield* resetPos();
            user.unit.disableInvincible();
            let shotList = [fanShot, ringShot, guidedShot];
            let currentShot = 0;
            while (user.unit.hpRatio > 0.7) {
                if (currentShot === 0) yield* summonMinions(minionName, 7, user.pos.width * 0.75);
                yield* user.coro.startAndGetWaitForFrag(shotList[currentShot]());
                if (!(user.unit.hpRatio > 0.7)) break;
                currentShot = (currentShot + 1) % shotList.length;
                if (Util.rand(100) > 30) {
                    yield* randPos();
                } else {
                    yield* waitForTime(1);
                }
            }
            yield* resetPos();
            shotList = [fanShotParallel, circleShot, spiralShot, ringShot];
            currentShot = 0;
            while (user.unit.hpRatio > 0.4) {
                if (currentShot === 0) yield* summonMinions(minionName, 9, user.pos.width * 0.75);
                yield* user.coro.startAndGetWaitForFrag(shotList[currentShot]());
                if (!(user.unit.hpRatio > 0.4)) break;
                currentShot = (currentShot + 1) % shotList.length;
                if (Util.rand(100) > 30) {
                    yield* randPos();
                    if (Util.rand(100) > 40) yield* randPos();
                } else {
                    yield* waitForTime(1.5);
                }
            }
            killMinions();
            yield* resetPos();
            user.coro.start(ringShotRepeat());
            while (true) {
                const x = user.pos.x, y = user.pos.y;
                const spiralId = user.coro.start(spiralShot(x, y));
                yield* waitForTime(0.8);
                const circleId = user.coro.start(circleShot(x, y));
                yield* user.coro.wait(spiralId, circleId);
                yield* waitForTime(2);
            }
        },
        boss1minion: function* (user, pattern, bullets, scene) {
            user.setAnime();
            user.move.setRevo(60);
            const shot1 = function* () {
                if (Util.rand(100) < 30) {
                    bullets.multiWay(user.pos.linkX, user.pos.linkY, { deg: Util.xyToDeg(scene.player.pos.x - user.pos.linkX, scene.player.pos.y - user.pos.linkY), count: 1, color: datas.color.bullet.enemyAim });
                } else {
                    bullets.multiWay(user.pos.linkX, user.pos.linkY, { count: 1, color: datas.color.bullet.enemyNormal1 });
                }
                yield* waitForTime(4);
            };
            user.coro.start(user.routineBasicShot(user, pattern, shot1));
        },
        boss2: function* (user, pattern, bullets, scene) {
            //ボス初期化
            user.addMix(Child);
            user.child.addCreator('minionRotator', () => new Mono(Move));
            user.setAnime();
            //取り巻き召喚
            const minionName = 'miniondove';
            const minionData = datas.baddies[minionName];
            let minionsRotators = [];
            const removeMinions = () => {
                for (const rotator of minionsRotators) {
                    for (const minion of rotator.minions) {
                        minion?.remove();
                    }
                };
                user.child.removeAll();
                minionsRotators.length = 0;
            }
            const killMinions = () => {
                for (const rotator of minionsRotators) {
                    for (const minion of rotator.minions) {
                        minion?.unit.defeat();
                    }
                }
                user.child.removeAll();
                minionsRotators.length = 0;
            };
            const _initMinion = (rotator, index) => {
                rotator.liveCount++;
                rotator.minions[index].unit.onDefeat = () => {
                    rotator.minions[index] = undefined;
                    rotator.liveCount--;
                    if (rotator.liveCount > 0) return;
                    rotator.obj.remove();
                    rotator.obj = undefined;
                };
            };
            const _createTorimakiRotator = (index, count, space, degOffset = 0) => {
                const rotator = minionsRotators[index] ??= { obj: undefined, minions: undefined, liveCount: 0 };
                if (rotator.obj) return rotator;
                const obj = rotator.obj = user.child.pool('minionRotator');
                const deg = (360 / count) * index + degOffset;
                obj.pos.parent = user;
                obj.pos.set(Util.degToX(deg) * space, Util.degToY(deg) * space, 0, 0);
                obj.move.setRevo(120);
                return rotator;
            }
            const summonMinions = function* (name, count, space) {
                const minionGroupCount = 3;
                const minionDeg = 360 / minionGroupCount;
                const minionDistance = minionData.size;
                //取り巻きの最大数が違うなら新規に呼び出す
                if (minionsRotators.length !== count) {
                    removeMinions();
                    for (let i = 0; i < count; i++) {
                        const rotator = _createTorimakiRotator(i, count, space);
                        rotator.minions = scene.spawner.formation(Baddie.name, 'circle', minionData, -1, scene.baddies, bullets, scene, { count: minionGroupCount, space: minionDistance, parent: rotator.obj, isPlaySpawnEffect: true });
                        for (let j = 0; j < minionGroupCount; j++) {
                            _initMinion(rotator, j);
                        }
                    }
                    return;
                }
                //倒された取り巻きだけ再召喚            
                let rotatorDegOffset = 0;
                for (let i = 0; i < count; i++) {
                    const obj = minionsRotators[i].obj;
                    if (!obj) continue;
                    rotatorDegOffset = obj.pos.xyDeg - (i * (360 / count));
                    break;
                }
                let minionDegOffset = 0;
                gotDegOffset:
                for (const rotator of minionsRotators) {
                    for (let i = 0; i < rotator.minions.length; i++) {
                        const minion = rotator.minions[i];
                        if (!minion) continue;
                        minionDegOffset = minion.pos.xyDeg - (i * minionDeg);
                        break gotDegOffset;//JSにGotoあったの？
                    }
                }
                for (let i = 0; i < count; i++) {
                    const rotator = _createTorimakiRotator(i, count, space, rotatorDegOffset);
                    for (let j = 0; j < minionGroupCount; j++) {
                        if (rotator.minions[j]) continue;
                        const deg = j * minionDeg + minionDegOffset;
                        rotator.minions[j] = scene.spawner.spawn(scene.baddies, Baddie.name, Util.degToX(deg) * minionDistance, Util.degToY(deg) * minionDistance, minionData, 0, bullets, scene, rotator.obj, true);
                        _initMinion(rotator, j);
                    }
                }
            };
            //撃破エフェクト
            user.unit.coroDefeat = function* () {
                killMinions();
                user.coro.stopAll('main');
                user.unit.defeatRequied();
                const pos = user.pos;
                for (let i = 0; i < 16; i++) {
                    user.unit.playDefeatEffect(pos.left + Util.rand(pos.width), pos.top + Util.rand(pos.height));
                    yield* waitForTime(1 / 8);
                }
                user.remove();
            };
            //弾パターン
            const circleAimShot = function* () {
                const count = 3;
                const spreadSpeed = 200, spreadVias = 0.5, aimSpeed = 350;
                //展開
                const bulletList = bullets.circle(user.pos.x, user.pos.y, { speed: spreadSpeed, count: count * 4, color: datas.color.bullet.enemyAim, isOutOfScreenToRemove: false });
                yield* waitForTime(0.4);
                //発射
                const baseBullet = bulletList.at(-1);
                const aimPhase = (bulletList, x, y) => {
                    const [vx, vy] = Util.normalizeXY(x, y);
                    for (const b of bulletList) {
                        b.move.vx = b.move.vx * spreadVias + vx * aimSpeed;
                        b.move.vy = b.move.vy * spreadVias + vy * aimSpeed;
                    }
                }
                aimPhase(bulletList, scene.player.pos.x - baseBullet.pos.x, scene.player.pos.y - baseBullet.pos.y);
                yield* waitForTime(1);
            }
            const circleAimShotCross = function* () {
                const count = 3;
                const spreadSpeed = 200, spreadVias = 0.5, aimSpeed = 350;
                //展開
                const leftBullets = bullets.circle(user.pos.left - user.pos.width, user.pos.y, { speed: spreadSpeed, count: count * 4, color: datas.color.bullet.enemyAim, isOutOfScreenToRemove: false });
                const rightBullets = bullets.circle(user.pos.right + user.pos.width, user.pos.y, { speed: spreadSpeed, count: count * 4, color: datas.color.bullet.enemyAim, isOutOfScreenToRemove: false });
                yield* waitForTime(0.4);
                //発射
                const baseIndex = leftBullets.length - count;
                const leftBullet = leftBullets[baseIndex];
                const rightBullet = rightBullets[baseIndex];
                let lx = scene.player.pos.x - leftBullet.pos.x, rx = scene.player.pos.x - rightBullet.pos.x, y = 0, vx, vy;
                if (Math.abs(lx) <= Math.abs(rx)) {
                    y = scene.player.pos.y - rightBullet.pos.y;
                    lx = rx * -1;
                } else {
                    y = scene.player.pos.y - leftBullet.pos.y;
                    rx = lx * -1;
                }
                const aimPhase = (bulletList, x) => {
                    [vx, vy] = Util.normalizeXY(x, y);
                    for (const b of bulletList) {
                        b.move.vx = b.move.vx * spreadVias + vx * aimSpeed;
                        b.move.vy = b.move.vy * spreadVias + vy * aimSpeed;
                    }
                }
                aimPhase(leftBullets, lx);
                aimPhase(rightBullets, rx);
                yield* waitForTime(1.5);
            }
            const circleAimShotCrossRepeat = function* () {
                while (true) {
                    yield* circleAimShotCross();
                    yield* waitForTime(4);
                }
            }
            const deraySpiralRandomShot = function* () {
                const space = 16;
                const count = 160;
                const speed1 = 400;
                const speed2 = 150;
                const token = {};
                let lastBullet = undefined;
                let deg = 0;
                const x = user.pos.x;
                const y = user.pos.y;
                const shot = (i, deg) => {
                    [lastBullet] = bullets.multiWay(x, y, { count: 1, speed: 0, color: datas.color.bullet.enemyNormal1, isOutOfScreenToRemove: false });
                    lastBullet.bullet.patternId = token;
                    const radius = (user.pos.width * 0.2) + i;
                    lastBullet.move.relativeDeg(deg, radius, speed1);
                    return space * 180 / (radius * Math.PI);
                }
                let current = 0;
                yield* repeatFor(1.5, count, () => {
                    deg += shot(current, deg);
                    current++;
                });
                yield* waitForFrag(() => {
                    let hasActiveBullet = false;
                    bullets.child.each((bullet) => {
                        if (bullet.bullet.patternId === token && bullet.move.isActive) {
                            hasActiveBullet = true;
                        }
                    });
                    return !hasActiveBullet;
                });
                bullets.child.each((bullet) => {
                    if (bullet.bullet.patternId !== token) return;
                    const deg = Util.rand(360);
                    bullet.move.set(Util.degToX(deg) * speed2, Util.degToY(deg) * speed2);
                    bullet.bullet.patternId = undefined;
                });
                yield* waitForTime(1);
            }
            const rapidFanShot = function* () {
                const count = 16;
                const space = 30;
                const speed = 500;
                const x = user.pos.linkX;
                const y = user.pos.linkY;
                yield* repeatFor(2, count, () => {
                    bullets.multiWay(x, y, { space: space, count: 5, speed: speed, color: datas.color.bullet.enemyNormal3 });
                });
                yield* waitForTime(1);
            }
            const rapidFanShotCross = function* () {
                const count = 16;
                const space = 30;
                const speed = 500;
                const x = user.pos.linkX;
                const y = user.pos.linkY;
                const width = user.pos.width;
                yield* repeatFor(2, count, () => {
                    bullets.multiWay(x - width, y, { space: space, count: 5, speed: speed, color: datas.color.bullet.enemyNormal3 });
                    bullets.multiWay(x + width, y, { space: space, count: 5, speed: speed, color: datas.color.bullet.enemyNormal3 });
                });
                yield* waitForTime(1);
            }
            const guidedSplitShot = function* () {
                const bulletlist = [];
                for (let i = 0; i < 2; i++) {
                    bulletlist.push(...bullets.multiWay(user.pos.x, user.pos.y, { deg: Util.rand(120, 60), space: 25, count: 1, speed: 500, firstSpeed: 0, accelTime: 3, color: datas.color.bullet.enemyGuided, guided: scene.player, guidedSpeed: 1.75 }));
                }
                yield* waitForTime(1.5);
                for (let i = 0; i < 2; i++) {
                    const bullet = bulletlist[i];
                    bullets.multiWay(bullet.pos.x, bullet.pos.y, { deg: 90, space: 72, count: 5, speed: 500, firstSpeed: 0, accelTime: 3, color: datas.color.bullet.enemyGuided, guided: scene.player, guidedSpeed: 1 });
                    bullet.remove();
                }
            };
            //ボスの移動
            const resetPos = function* () {
                yield* user.move.to(Game.width * 0.5, Game.height * 0.3, 200, { easing: Ease.sineInOut });
            };
            const randPos = function* () {
                const x = Util.rand(Game.width - user.pos.width) + (user.pos.width * 0.5);
                const y = Util.rand((Game.height * 0.4) - user.pos.height) + (user.pos.height * 0.5);
                yield* user.move.to(x, y, 200, { easing: Ease.sineInOut });
            };
            //ここからボスの動作
            user.unit.enableInvincible();//登場時無敵
            yield* resetPos();
            user.unit.disableInvincible();
            //パターン1
            let shotList = [circleAimShot, rapidFanShot, guidedSplitShot];
            let currentShot = 0;
            while (user.unit.hpRatio > 0.7) {
                if (currentShot === 0) yield* summonMinions(minionName, 3, user.pos.width);
                yield* user.coro.startAndGetWaitForFrag(shotList[currentShot]());
                if (!(user.unit.hpRatio > 0.7)) break;
                currentShot = (currentShot + 1) % shotList.length;
                if (Util.rand(100) > 30) {
                    yield* randPos();
                } else {
                    yield* waitForTime(1);
                }
            }
            yield* resetPos();
            //パターン2
            shotList = [circleAimShotCross, rapidFanShotCross, deraySpiralRandomShot, guidedSplitShot];
            currentShot = 0;
            while (user.unit.hpRatio > 0.4) {
                if (currentShot === 0) yield* summonMinions(minionName, 5, user.pos.width);
                yield* user.coro.startAndGetWaitForFrag(shotList[currentShot]());
                if (!(user.unit.hpRatio > 0.4)) break;
                currentShot = (currentShot + 1) % shotList.length;
                if (Util.rand(100) > 30) {
                    yield* randPos();
                    if (Util.rand(100) > 40) yield* randPos();
                } else {
                    yield* waitForTime(1.5);
                }
            }
            //パターン3
            killMinions();
            yield* resetPos();
            user.coro.start(circleAimShotCrossRepeat());
            while (true) {
                yield* user.coro.wait(user.coro.start(rapidFanShotCross()), user.coro.start(deraySpiralRandomShot()));
            }
        },
        boss2minion: function* (user, pattern, bullets, scene) {
            user.setAnime();
            user.move.setRevo(120);
            const shot1 = function* () {
                if (Util.rand(100) < 30) {
                    bullets.multiWay(user.pos.linkX, user.pos.linkY, { deg: Util.xyToDeg(scene.player.pos.x - user.pos.linkX, scene.player.pos.y - user.pos.linkY), count: 1, color: datas.color.bullet.enemyAim });
                } else {
                    bullets.multiWay(user.pos.linkX, user.pos.linkY, { count: 2, color: datas.color.bullet.enemyNormal2 });
                }
                yield* waitForTime(4);
            };
            user.coro.start(user.routineBasicShot(user, pattern, shot1));
        }
    }
}
class Bullet {//弾コンポーネント  
    constructor() {
        this.reset();
    }
    reset() {
        this.set(1, 0, false)
    }
    set(damage, point, through) {
        this.damage = damage;
        this.point = point;
        this.through = through;
        this.patternId = undefined;
    }
}
class Attack extends Mono {
    constructor() {
        super(Guided, Collision, Brush, Bullet);
    }
    set(x, y, vx, vy, firstSpeed, accelTime, color, damage, point, isOutOfScreenToRemove) {
        this.addMix(OutToRemove, 0);
        this.outtoremove.isOutOfScreenToRemove = isOutOfScreenToRemove;
        this.pos.set(x, y, 8, 8);
        this.pos.align = 1;
        this.pos.valign = 1;
        this.move.set(vx, vy);
        this.move.setChangeSpeed(accelTime, firstSpeed);
        this.collision.set(6, 6);
        this.color.setColor(color);
        this.brush.circle();
        this.bullet.set(damage, point, false);
        return this;
    }
    vanish(effect) {
        const size = this.pos.width;
        effect.emittCircle(5, size * 3, 0.75, size * 2, this.color.value, this.pos.linkX, this.pos.linkY, false, { emoji: EMOJI.STAR });
        this.remove();
    }
}
class BulletBox extends Mono {//弾
    constructor() {
        super(Child);
        this.reset();
        this.child.drawlayer = 'effect';
        this.child.addCreator('bullet', () => new Attack());
    }
    firing(x, y, vx, vy, firstSpeed, accelTime, color, damage, point, isOutOfScreenToRemove) {
        const bullet = this.child.pool('bullet').set(x, y, vx, vy, firstSpeed, accelTime, color, damage, point, isOutOfScreenToRemove);
        return bullet;
    }
    multiWay(x, y, { deg = 270, space = 30, count = 3, speed = 150, firstSpeed = 0, accelTime = 0, color = 'red', guided = undefined, guidedSpeed = 0, damage = 1, point = 0, isOutOfScreenToRemove = true } = {}) {
        let d = deg;
        const offset = space * (count - 1) / 2;
        const result = [];
        for (let i = 0; i < count; i++) {
            const bullet = result[i] = this.firing(x, y, Util.degToX(((d - offset) + (space * i)) % 360) * speed, Util.degToY(((d - offset) + (space * i)) % 360) * speed, firstSpeed, accelTime, color, damage, point, isOutOfScreenToRemove);
            if (guided) bullet.guided.set(guided, guidedSpeed, 0, 2);
        }
        return result;
    }
    circle(x, y, { count = 36, offset = 0, speed = 150, firstSpeed = 0, accelTime = 0, color = 'red', damage = 1, point = 0, isOutOfScreenToRemove = true } = {}) {
        const d = 360 / count;
        const result = [];
        for (let i = 0; i < count; i++) {
            result[i] = this.firing(x, y, Util.degToX((d * i + offset) % 360) * speed, Util.degToY((d * i + offset) % 360) * speed, firstSpeed, accelTime, color, damage, point, isOutOfScreenToRemove);
        }
        return result;
    }
}
class Bomb extends Mono {
    constructor() {
        super(Coro, Pos, Scale, Collision, Brush, Bullet);
    }
    set(x, y) {
        this.pos.set(x, y, Game.height * 2, Game.height * 2);
        this.pos.align = 1;
        this.pos.valign = 1;
        this.scale.set(0, 0);
        this.collision.isCircle = true;
        this.brush.circle();
        this.color.setColor('white');
        this.update = () => {
            this.color.alpha = 1 - this.scale.ease.percentage;
        };
        this.bullet.set(10, 100, true, undefined);
        this.coro.start(this.coroDefault(), 'main');
    }
    *coroDefault() {
        yield* this.scale.set(1, 1, 1, Ease.sineout);
        this.remove();
    }
}
class BombCarrier extends Mono {
    constructor() {
        super(Child);
        this.child.addCreator('bomb', () => new Bomb());
    }
    drop(x, y) {
        const bomb = this.child.pool('bomb');
        bomb.set(x, y);
    }
}
class BgCloud extends Mono {
    constructor() {
        super(Coro, Child);
        //this.child.drawlayer = 'cloud';
        this.child.addCreator('cloud', () => this._creator());
    }
    _creator() {
        const deco = new Mono(Move, Moji);
        deco.update = () => {
            if (deco.pos.top > Game.height) {
                deco.remove();
            }
        };
        return deco;
    }
    Run() {
        this.child.removeAll();
        this.coro.reset();
        for (let i = 0; i < 5; i++) {
            this._createCloud(true);
        }
        this.coro.start(this._coroCloud());
    }
    _createCloud(isFirst) {
        const sizeMax = Game.width * 0.5;
        const sizeMin = sizeMax * 0.2;
        const color = datas.color.cloud;
        const size = Util.lerp(sizeMax, sizeMin, Util.randF() ** 1.75);
        const x = Game.width * 0.5 + (Util.rand((Game.width + size) * 0.5, size) * (Util.rand(1, 0) ? 1 : -1));
        const y = -size + (isFirst ? Util.rand(Game.height) : 0);
        const scrollSpeed = size;
        const c = this.child.pool('cloud');
        c.moji.set(Util.parseUnicode(EMOJI.CLOUD), x, y, { size: size, color: color, font: cfg.font.emoji.name, align: 1, valign: 1, useImageCache: true });
        c.color.filter = `brightness(${1 + 0.2 * Util.normalize(sizeMax, sizeMin, size)})`;
        c.move.set(0, scrollSpeed);
    }
    * _coroCloud() {
        while (true) {
            this._createCloud();
            yield* waitForTime(Util.rand(2, 1));
        }
    }
}
class BgDeco extends Mono {
    constructor() {
        super(Coro, Child);
        this.child.addCreator('stars', () => this._decoCreator());
        this.child.addCreator('fullmoon', () => this._fullmoonCreator());
    }
    _decoCreator() {
        const deco = new Mono(Move, Moji);
        deco.update = () => {
            if (deco.pos.top > Game.height) {
                deco.remove();
            }
        };
        return deco;
    }
    _fullmoonCreator() {
        return new Mono(Move, Brush);
    }
    Run() {
        this.child.removeAll();
        this.coro.reset();
        for (let i = 0; i < 80; i++) {
            this._createStarfall(true);
        }
        this.coro.start(this._coroStars());
    }
    _createStar(x, y, size) {
        const color = '#ffffff';
        const star = this.child.pool('stars');
        star.moji.set(Util.parseUnicode(EMOJI.STAR), x, y, { size: size, color: color, font: cfg.font.emoji.name, align: 1, valign: 1, useImagecache: true });
        star.color.setAlpha(0.5);
        return star;
    }
    _createStarfall(isFirst = false) {
        const size = Util.lerp(10, 1, Util.randF() ** 1);
        const x = Util.rand(Game.width, 0);
        const y = -size + (isFirst ? Util.rand(Game.height) : 0);
        const star = this._createStar(x, y, size);
        star.move.set(0, size * 5);
    }
    _createShootingStar() {
        const size = 10;
        const x = Util.rand(Game.width, 0);
        const y = Util.rand(Game.height * 0.5);
        const star = this._createStar(x, y, size);
        const speed = 300;
        const deg = 270 + 45 * (x < Game.width * 0.5 ? 1 : -1);
        star.move.set(Util.degToX(deg) * speed, Util.degToY(deg) * speed);
        star.move.setRotate(540);
    }
    *_coroMilkyway() {
        for (let i = 0; i < 150; i++) {
            const size = Util.lerp(10, 1, Util.randF() ** 1);
            const x = Util.rand(Game.width, 0);
            const y = -(size + (x * 0.5) + ((Util.randF() - 0.5) * (120 / size)));
            const star = this._createStar(x, y, size);
            star.move.set(0, 25);
            yield* waitForTime(0.05);
        }
    }
    * _coroStars() {
        while (true) {
            if (Util.rand(100) < 5) this._createShootingStar();
            this._createStarfall();
            if (Util.rand(1000) < 5) yield* this._coroMilkyway();
            yield* waitForTime(0.3);
        }
    }
    _createFullMoon() {
        const moon = this.child.pool('fullmoon');
        moon.pos.align = 1;
        moon.pos.valign = 1;
        const kikilala = Game.width * 0.5;
        moon.pos.width = kikilala;
        moon.pos.height = kikilala;
        moon.pos.x = kikilala;
        moon.pos.y = -(kikilala * 0.5);
        moon.brush.circle();
        moon.color.setColor(datas.color.moon);
        moon.color.setAlpha(0.3);
        moon.move.relative(0, kikilala + kikilala * 0.2, kikilala * 0.5);
    }
    moonRise() {
        this._createFullMoon();
    }
}
class Menu extends Mono {//メニュー表示
    constructor(x, y, size, { icon = EMOJI.CAT, align = 1, color = cfg.theme.text, highlite = cfg.theme.highlite, isEnableCancel = false } = {}) {
        super(Pos, Child);
        this.pos.x = x;
        this.pos.y = y;
        this.pos.align = align;
        this.size = size;
        this.index = 0;
        this.count = 0;
        this.color = color;
        this.highlite = highlite;
        this.isEnableCancel = isEnableCancel;
        this.child.add(this.curL = new Label(Util.parseUnicode(icon), 0, 0, { size: this.size, color: this.highlite, font: cfg.font.emoji.name, align: 2, valign: 1 }));
        this.child.add(this.curR = new Label(Util.parseUnicode(icon), 0, 0, { size: this.size, color: this.highlite, font: cfg.font.emoji.name, valign: 1 }));
        this.indexOffset = this.child.objs.length;
    }
    add(text) {
        this.child.add(new Label(text, this.pos.x, this.pos.y + this.size * 1.5 * (this.count), { size: this.size, color: this.color, align: this.pos.align, valign: 1 }));
        this.count++;
    }
    *coroSelect(newIndex = this.index) {
        this.moveIndex(newIndex);
        while (true) {
            yield undefined;
            yield* this.move('up', this.count - 1);
            yield* this.move('down', 1);
            if (Game.input.isPress('z')) return this.child.objs[this.index + this.indexOffset].moji.text;
            if (this.isEnableCancel && Game.input.isPress('x')) return undefined;
        }
    }
    *move(key, direction) {
        if (!Game.input.isDown(key)) return;
        if (this.count > 0) this.moveIndex((this.index + direction) % (this.count));
        yield* waitForTimeOrFrag(Game.input.isPress(key) ? cfg.input.repeatWaitFirst : cfg.input.repeatWait, () => Game.input.isUp(key) || Game.input.isPress('z') || (this.isEnableCancel && Game.input.isPress('x')));
    }
    moveIndex(newIndex) {
        this.child.objs[this.index + this.indexOffset].color.setColor(this.color);
        this.index = newIndex;
        const item = this.child.objs[newIndex + this.indexOffset];
        item.color.setColor(this.highlite);
        const w = item.pos.width;
        const x = (w * 0.5) * this.pos.align;
        this.curL.pos.x = item.pos.x - x;
        this.curL.pos.y = item.pos.y;
        this.curR.pos.x = item.pos.x - x + w;
        this.curR.pos.y = item.pos.y;
    }
    current = () => this.index === -1 ? undefined : this.child.objs[this.index + this.indexOffset].moji.text;
}

class SceneDebug extends Mono {//デバッグルーム
    constructor() {
        super(Child);
        //this.child.add(new Label('実験室'));

        const y = new Mono(Coro, Move, Lissajous, Scale, Brush);
        y.pos.set(Game.width * 0.5, Game.height * 0.5, 128, 128);
        y.pos.align = 1;
        y.pos.valign = 1;
        //y.move.setRevo(30);
        y.lissajous.set(0.5, 1, 128, 128);
        y.color.setColor('blue');
        y.coro.start(function* () {
            while (true) {
                y.scale.set(0, 0);
                yield* y.scale.set(1, 1, 1);
                yield* waitForFrag(() => Game.input.isPress('x'));
            }
        }());
        //this.child.add(y);

        //文字表示テスト
        // let m = new Mono(Collision, Moji);
        // m.moji.set(Util.parseUnicode(EMOJI.CROW), Game.width * 0.5, Game.height * 0.5, { size: 128, font: cfg.font.emoji.name, useImagecache: false });
        // m.pos.scaleX = 2;
        // m.pos.scaleY = 2;
        // m.collision.set(m.pos.width, m.pos.height);
        // m.collision.isVisible = true;
        // this.child.add(m);

        let text = ['あ', 'い', 'う'];
        let i = 0;
        const put = () => {
            return text[i];
        }
        let m = new Mono(Coro, Move, Scale, Collision, Moji);
        m.moji.set(put, 0, 256, { size: 128, font: cfg.font.emoji.name, useImagecache: true });
        m.pos.scaleX = 2;
        m.pos.scaleY = 2;
        m.collision.set(m.pos.width, m.pos.height);
        m.collision.isVisible = true;
        m.color.alpha = 0.2;
        m.coro.start(function* () {
            while (true) {
                m.scale.set(0, 0);
                yield* m.scale.set(2, 2, 1);
                yield* waitForFrag(() => Game.input.isPress('x'));
                i = (i + 1) % 3;
            }
        }());
        this.child.add(m);

        let b = new Tofu();
        b.pos.set(16, 16, 8, 8);
        b.color.setColor('#ff83a0');
        this.child.add(b);
    }
    *coroDefault() {
        Game.pushScene(this);
        while (true) {
            yield undefined;
            if (Game.input.isPress('z')) break;
        }
        Game.popScene();
    }
}
class Sky extends Mono {
    constructor() {
        super(Picture);
        this.picture.set(Game.width, Game.height, (ctx) => {
            const grad = ctx.createLinearGradient(0, 0, 0, Game.height);
            grad.addColorStop(0, datas.color.highsky);
            //grad.addColorStop(0.95,"#FF7518");
            grad.addColorStop(1, datas.color.lowsky);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, Game.width, Game.height);
        });
    }
}
class SceneTitle extends Mono {//タイトル画面
    constructor() {
        super(Child);
        //ゲームの初期化
        this.init();
        //背景
        this.child.add(this.bg = new Mono(Child));
        this.bg.child.drawlayer = 'default';
        this.bg.child.add(this.sky = new Sky());
        this.bg.child.add(this.cloud = new BgCloud());
        this.child.add(this.bgDeco = new BgDeco());
        //タイトル
        this.child.add(this.title = new Title());
        //ボタンを押してね
        this.child.add(this.presskey = new Label(text.presskey, Game.width * 0.5, Game.height * 0.5 + cfg.fontSize.medium * 1.5, { size: cfg.fontSize.medium, align: 1, valign: 1 }));
        //メニュー
        this.title.child.add(this.titleMenu = new TitleMenu());
        this.titleMenu.hide();
    }
    init() {
        //設定変更
        cfg.theme.text = datas.color.text;
        cfg.theme.highlite = datas.color.texthighlight;
        //キー割り当て
        Game.input.keybind('z', 'z', { button: 1 });
        Game.input.keybind('x', 'x', { button: 0 });
        Game.input.keybind('c', 'c', { button: 3 });
        //セーブデータのロード
        shared.load(cfg.saveData.name);
    }
    *coroDefault() {
        Game.pushScene(this);
        this.cloud.Run();
        this.bgDeco.Run();
        this.presskey.color.blink(0.5);
        while (true) {
            yield undefined;
            if (!Game.input.isPress('z')) continue;
            this.presskey.hide();
            yield* this.coroTitleMenu();
            this.presskey.show();
            this.presskey.color.blink(0.5);
        }
    }
    *coroTitleMenu() {
        this.titleMenu.show();
        while (true) {
            const result = yield* this.titleMenu.menu.coroSelect();
            if (!result) {
                this.titleMenu.menu.moveIndex(0);
                this.titleMenu.hide();
                return;
            }
            if (result === text.start) {
                this.hide();
                yield* new ScenePlay().coroDefault();
                this.show();
                continue;
            }
            this.title.hide();
            if (result === text.highscore) yield* new SceneHighscore().coroDefault();
            if (result === text.credit) yield* new SceneCredit().coroDefault();
            //if (result === '実験室') yield* new SceneDebug().coroDefault();
            this.title.show();
        }
    }
}
class Title extends Mono {//タイトル
    constructor() {
        super(Child);
        //タイトル
        const titleY = Game.height * 0.25;
        this.child.add(new Label(text.title, Game.width * 0.5, titleY, { size: cfg.fontSize.large, color: cfg.theme.highlite, align: 1, valign: 1 }));
        this.child.add(new Label(text.title2, Game.width * 0.5, titleY + cfg.fontSize.large * 1.5, { size: cfg.fontSize.large, align: 1, valign: 1 }));
        //コピーライト表示
        this.child.add(new Label(text.title_copyright, Game.width * 0.5, Game.height - cfg.fontSize.small, { size: cfg.fontSize.small, align: 1, valign: 2 }));
    }
}
class TitleMenu extends Mono {//タイトルメニュー
    constructor() {
        super(Child);
        //メニュー
        this.child.add(this.menu = new Menu(Game.width * 0.5, Game.height * 0.5, cfg.fontSize.medium, { isEnableCancel: true }));
        this.menu.add(text.start);
        this.menu.add(text.highscore);
        this.menu.add(text.credit);
        //this.menu.add('実験室');
        //操作方法
        this.child.add(this.explanation1 = new Label(text.explanation1, Game.width * 0.5, Game.height - (cfg.fontSize.normal * 4), { size: cfg.fontSize.normal, align: 1, valign: 2 }));
        this.child.add(this.explanation2 = new Label(text.explanation2, Game.width * 0.5, Game.height - cfg.fontSize.normal * 3, { size: cfg.fontSize.normal, align: 1, valign: 2 }));
        this.child.add(this.explanation3 = new Label(text.explanation3, Game.width * 0.5, Game.height - cfg.fontSize.normal * 2, { size: cfg.fontSize.normal, align: 1, valign: 2 }));
    }
}
class ScenePlay extends Mono {//プレイ画面
    constructor() {
        super(Coro, Child);
        this.isClear = false;
        this.bossMode = false;
        this.spawner = new Spawner(this);
        //背景
        this.child.add(this.bg = new Mono(Child));
        this.bg.child.drawlayer = 'default';
        this.bg.child.add(this.sky = new Sky());
        this.bg.child.add(this.cloud = new BgCloud());
        this.child.add(this.bgDeco = new BgDeco());
        //ボム
        this.child.add(this.playerbomb = new BombCarrier());
        //プレイヤー
        this.child.add(this.playerside = new Mono(Child));
        this.playerside.child.addCreator(Player.name, () => new Player());
        this.player = undefined;
        this.playerDammy = new Mono(Pos);
        //敵キャラ
        this.child.add(this.baddies = new Mono(Child));
        this.baddies.child.addCreator(Baddie.name, () => new Baddie());
        //弾
        this.child.add(this.playerbullets = new BulletBox());
        this.child.add(this.baddiesbullets = new BulletBox());
        //アイテム
        this.child.add(this.items = new Mono(Child));
        this.items.child.addCreator(Baddie.name, () => new Baddie());
        //パーティクル
        this.child.add(this.effect = new Particle());
        this.effect.child.drawlayer = 'effect';
        this.child.add(this.afterimage = new Afterimage(Game.width, Game.height, 'effect'));
        const ttt = Game.get('effect');
        //テロップ
        this.child.add(this.telop = new Label('', Game.width * 0.5, Game.height * 0.5, { size: cfg.fontSize.medium, color: cfg.theme.highlite, align: 1, valign: 1 }));
        this.telop.hide();
        //画面UI
        this.child.add(this.ui = new Mono(Child));
        //this.ui.child.drawlayer = 'ui';
        //スコア表示        
        this.ui.child.add(this.textScore = new Label(() => `SCORE ${shared.playdata.total.point} KO ${shared.playdata.total.ko}`, 2, 2));
        //this.ui.child.add(this.fpsView = new Label(() => `FPS: ${Game.fps}`, Game.width - 2, 2, { align: 2 }));
        this.ui.child.add(this.textStage = new Label(() => `STAGE: ${shared.playdata.total.stage}`, Game.width - 2, 2, { align: 2 }));
        //残機表示
        this.ui.child.add(this.remains = new Label(() => this.createRemainsText(datas.player.data.char, shared.playdata.total.remains), 0, cfg.fontSize.normal * 1.25, { color: datas.player.data.color, font: cfg.font.emoji.name }));
        //ボム所持数表示
        this.ui.child.add(this.bomb = new Label(() => this.createRemainsText(EMOJI.BOMB, shared.playdata.total.bomb), cfg.fontSize.normal * 1.25 * 6, cfg.fontSize.normal * 1.25, { color: 'black', font: cfg.font.emoji.name }));
        //キャラ個別UI
        this.ui.child.add(this.charaUi = new Mono(Child));
        //デバッグ表示
        //this.ui.child.add(this.debug = new Watch());
        // this.debug.pos.y = cfg.fontSize.normal * 1.25 * 2;
        // this.debug.add(() => `敵の数:${this.baddies.child.liveCount}`);
        // this.debug.add(() => `自機の弾の数${this.playerbullets.child.liveCount}`);
        // this.debug.add(() => `敵の弾の数${this.baddiesbullets.child.liveCount}`);
        // this.debug.add(() => `粒子の数${this.effect.child.liveCount}`);
        // this.debug.add(() => `背景の数${this.background.child.liveCount}`);
    }
    createRemainsText(emoji, count) {
        if (count <= 0) return '';
        if (count <= 5) {
            let text = '';
            for (let i = 0; i < count; i++) {
                text += Util.parseUnicode(emoji);
            }
            return text;
        }
        return `${Util.parseUnicode(emoji)}×${count}`;
    }
    * showTelop(text, time, blink = 0) {
        this.telop.moji.set(text);
        this.telop.color.blink(blink);
        this.telop.show();
        yield* waitForTime(time);
        this.telop.hide();
    }
    hitCheck(selfs, others, onHit) {
        selfs.child.each((self) => {
            others.child.each((other) => {
                if (!self.isExist || !other.isExist) return;
                if (!self.collision.hit(other)) return;
                onHit(self, other);
            });
        });
    }
    hitCheckAttack(selfs, others) {
        this.hitCheck(selfs, others, (self, other) => {
            if (!other.unit.isDamage()) return;
            self.hit?.(this.effect);
            other.unit.damage(self.bullet.damage);
            this.addPoint(self.bullet.point);
            if (!self.bullet.through) self.remove();
        });
    }
    postUpdate() {
        //キャラ同士の当たり判定
        this.hitCheck(this.baddies, this.playerside, (baddie, player) => {
            if (!player.unit.isDamage()) return;
            player.unit.damage(1);
        });
        //ボムの当たり判定
        this.hitCheckAttack(this.playerbomb, this.baddies);
        this.hitCheck(this.playerbomb, this.baddiesbullets, (bomb, bullet) => {
            bullet.remove();
        });
        //弾の当たり判定
        this.hitCheckAttack(this.playerbullets, this.baddies);
        this.hitCheckAttack(this.baddiesbullets, this.playerside);
        //自機とアイテムの当たり判定
        this.hitCheck(this.items, this.playerside, (item, player) => {
            if (player !== this.player) return;
            item.unit.damage(1);
        });
    }
    * coroDefault() {
        Game.pushScene(this);
        this.newGame();
        while (true) {
            yield undefined;
            if (this.isClear) {//ステージクリア
                this.baddiesbullets.child.each((b) => { b.vanish(this.effect); })
                yield* this.showTelop(text.stageclear, 2);
                yield* new SceneClear().coroDefault();
                this.nextStage();
                continue;
            }
            if (this.isFailure) {//ゲームオーバー
                yield* this.showTelop(text.gameover, 2);
                const [isNewRecord, rank] = this.isNewRecord();
                if (isNewRecord) {
                    shared.save(cfg.saveData.name)
                    yield* new SceneHighscore(isNewRecord, rank).coroDefault();
                }
                switch (yield* new SceneConfirm(text.gameover, [text.continue, text.returntitle]).coroDefault()) {
                    case text.continue:
                        this.newGame();
                        break;
                    case text.returntitle:
                        Game.popScene();
                        return;
                }
                continue;
            }
            if (Game.input.isPress('c')) {//ポーズメニューを開く
                this.pause();
                switch (yield* new SceneConfirm(text.pause, [text.resume, text.restart, text.returntitle], { isPause: true, isEnableCancel: true }).coroDefault()) {
                    case text.restart:
                        this.newGame();
                        break;
                    case text.returntitle:
                        Game.popScene();
                        return;
                }
                this.resume();
                continue;
            }
            //経過時間
            shared.playdata.total.time += Game.delta;
        }
    }
    * coroStage() {
        //yield* waitForFrag(()=>false);
        if (!this.bossMode) yield* this._phaseInvasion();
        yield* this._phaseBoss();
        this.player.collision.isEnable = false;
    }
    * _phaseInvasion() {//道中
        const items = ['bomb', 'powerupShot1', 'powerupShield1'];
        const itemSpawnRate = 0.1;
        let itemSpawnCounter = 0;
        const appears = ['crow', 'dove', 'crossdove', 'obake', 'bigcrow'];
        const phaseSec = 30;
        const baddiesMax = 100;
        const spawnIntervalFactor = 0.97 ** shared.playdata.total.stage;//ステージ数に応じて敵の出現間隔が短くなる
        yield* waitForTime(2);
        while (this.elaps <= phaseSec || this.baddies.child.liveCount > 0) {
            yield undefined;
            //敵キャラ出現
            if (this.elaps > phaseSec || this.baddies.child.liveCount > baddiesMax) continue;
            const baddieName = appears[Util.rand(appears.length - 1)];
            const data = datas.baddies[baddieName];
            const formation = data.forms[Util.rand(data.forms.length - 1)];
            const spawnCount = Util.rand(Util.clamp(shared.playdata.total.stage * 0.25, 4, Math.floor(Game.width / data.size)));
            this.spawner.formation(Baddie.name, formation, data, -1, this.baddies, this.baddiesbullets, this, { count: spawnCount });
            yield* waitForTime((spawnCount * 1.5 + Util.rand(1) ? 1 : -1) * spawnIntervalFactor);
            //アイテム出現    
            if (itemSpawnCounter >= 15 || Util.rand(100) < itemSpawnRate * 100) {
                itemSpawnCounter = 0;
                const itemName = items[Util.rand(items.length - 1)];
                const data = datas.items[itemName];
                const formation = 'topsingle';
                this.spawner.formation(Baddie.name, formation, data, -1, this.items, undefined, this);
            }
            itemSpawnCounter++;
        }
        yield* this.showTelop('WARNING!', 2, 0.25);
    }
    * _phaseBoss() {//ボス戦
        //背景
        //this.background.moonRise();
        //ボス呼び出し
        const bossName = datas.bosses[(shared.playdata.total.stage - 1) % datas.bosses.length];
        const data = datas.baddies[bossName];
        const formation = data.forms[0];
        const [boss] = this.spawner.formation(Baddie.name, formation, data, -1, this.baddies, this.baddiesbullets, this, { x: Game.width * 0.5 });
        //ボスのHPをステージ数に応じて増やす
        const collencetHP = Math.floor(boss.unit.status.hpMax * (1 + (shared.playdata.total.stage - 1) / 10));
        boss.unit.status.hp = boss.unit.status.hpMax = collencetHP;
        boss.unit.onDefeat = () => {
            this.isClear = true;
        }
        //ボスのHPゲージ
        const bossHpGauge = new Gauge();
        bossHpGauge.set(Game.width * 0.5, 28 * 3, Game.width * 0.9, 16, cfg.theme.text, 2, boss.unit.status.hp, () => boss.unit.status.hp);
        bossHpGauge.pos.align = 1;
        this.charaUi.child.add(bossHpGauge);
        //ボスが倒されるまで待機
        while (!this.isClear) {
            if (this.isFailure) boss.unit.status.invincible = true;
            yield undefined;
        }
        bossHpGauge.remove();
    }
    newGame() {
        shared.playdata.backup = new scoreData();
        shared.playdata.total = new scoreData();
        this.resetStage();
    }
    nextStage() {
        shared.playdata.total.stage++;
        shared.playdata.backup = new scoreData(shared.playdata.total);
        this.resetStage(true);
    }
    playerSpawn() {
        this.player?.remove();
        this.player = this.playerside.child.pool(Player.name);
        this.player.set(this);
    }
    swapPlayerDammy() {//自機が撃破されて画面にいない間のターゲット用ダミー
        this.playerDammy.pos.set(this.player.pos.x, this.player.pos.y, 0, 0);
        this.player = this.playerDammy;
    }
    playerRespawn() {
        this.playerSpawn();
        this.player.respawnRequied();
    }
    resetStage(isNextStage = false) {
        this.isClear = false;
        this.extendedCount = (Math.floor(shared.playdata.total.point / datas.game.extendedScore) + 1) * datas.game.extendedScore;
        this.cloud.Run();
        this.bgDeco.Run();
        this.playerbomb.child.removeAll();
        if (!isNextStage) {//次のステージに進む場合にパワーアップを持続させるための分岐
            this.playerSpawn();
            this.charaUi.child.removeAll();
        } else {
            this.player.resetPos();
            this.player.resetCoro();
            this.player.collision.isEnable = true;
        }
        this.baddies.child.removeAll();
        this.playerbullets.child.removeAll();
        this.baddiesbullets.child.removeAll();
        this.items.child.removeAll();
        this.effect.child.removeAll();
        this.coro.reset();
        this.coro.start(this.coroStage());
        this.telop.hide();
    }
    addPoint(point) {
        shared.playdata.total.point += point;
        if (shared.playdata.total.point <= this.extendedCount) return;
        this.extendedCount += datas.game.extendedScore;
        shared.playdata.total.remains++;
    }
    addKo() {
        shared.playdata.total.ko++;
    }
    isNewRecord() {
        shared.highscores.push(shared.playdata.total);
        shared.highscores.sort((a, b) => b.point - a.point);
        let i = 0;
        for (; i < shared.highscores.length; i++) {
            if (shared.highscores[i] === shared.playdata.total) break;
        }
        if (shared.highscores.length > datas.game.highscoreListMax) shared.highscores.pop();
        return [i < shared.highscores.length, i];
    }
    get elaps() { return shared.playdata.total.time - shared.playdata.backup.time; }
    get isFailure() { return shared.playdata.total.remains < 0; }
}
class SceneConfirm extends Mono {//確認メッセージ
    constructor(caption, items, { isEnableCancel = false, isPause = false, isDialog = false } = {}) {
        super(Child);
        const captionColor = isDialog ? cfg.theme.text : cfg.theme.highlite;
        this.child.add(new Tofu().set(0, 0, Game.width, Game.height, 'black', 0.25));
        this.child.add(new Label(caption, Game.width * 0.5, Game.height * 0.25, { size: cfg.fontSize.medium, color: captionColor, align: 1, valign: 1 }));
        this.child.add(this.menu = new Menu(Game.width * 0.5, Game.height * 0.5, cfg.fontSize.medium, { isEnableCancel: isEnableCancel }));
        for (const item of items) this.menu.add(item);
        this.isPause = isPause;
    }
    *coroDefault(firtsIndex) {
        Game.pushScene(this);
        if (Game.get('effect')) Game.get('effect').isPauseBlur = this.isPause;
        const result = yield* this.menu.coroSelect(firtsIndex);
        if (Game.get('effect')) Game.get('effect').isPauseBlur = false;
        Game.popScene();
        return result;
    }
}
class SceneClear extends Mono {//ステージクリア画面
    constructor() {
        super(Child);
        this.child.add(new Label(text.stageclear, Game.width * 0.5, Game.height * 0.25, { size: cfg.fontSize.medium, color: cfg.theme.highlite, align: 1, valign: 1 }));
        let x = Game.width * 0.4;
        const y = Game.height * 0.4;
        const line = cfg.fontSize.medium * 1.5;
        const stat = shared.getCurrentStat();
        this.child.add(new Label(text.stage, x, y, { align: 2, valign: 1 }));
        this.child.add(new Label(text.time, x, y + line, { align: 2, valign: 1 }));
        this.child.add(new Label(text.point, x, y + (line * 2), { align: 2, valign: 1 }));
        this.child.add(new Label(text.ko, x, y + (line * 3), { align: 2, valign: 1 }));
        x = Game.width * 0.8;
        this.child.add(new Label(stat.stage, x, y, { align: 2, valign: 1 }));
        this.child.add(new Label(stat.time, x, y + line, { align: 2, valign: 1 }));
        this.child.add(new Label(stat.point, x, y + (line * 2), { align: 2, valign: 1 }));
        this.child.add(new Label(stat.ko, x, y + (line * 3), { align: 2, valign: 1 }));
        const nextStage = new Label(text.nextStage, Game.width * 0.5, Game.height - (line * 2), { size: cfg.fontSize.medium, align: 1, valign: 1 })
        nextStage.color.blink(0.5);
        this.child.add(nextStage);
    }
    *coroDefault() {
        Game.pushScene(this);
        while (true) {
            yield undefined;
            if (Game.input.isPress('x')) break;
        }
        Game.popScene();
        return;
    }
}
class SceneHighscore extends Mono {//ハイスコア画面
    constructor(isNewRecord = false, rank = -1) {
        super(Child);
        this.isNewRecord = isNewRecord;
        this.rank = rank;
        if (this.isNewRecord) this.child.add(new Tofu().set(0, 0, Game.width, Game.height, 'black', 0.25));
        this.child.add(new Label(text.highscore, Game.width * 0.5, Game.height * 0.15, { size: cfg.fontSize.medium, color: cfg.theme.highlite, align: 1, valign: 1 }));
        this.child.add(this.scoreContainer = new Mono(Child));
        this._applyScores();
        if (!this.isNewRecord) this.child.add(this.explanation1 = new Label(text.highscore_clear_key, Game.width * 0.5, Game.height, { align: 1, valign: 2 }));
    }
    _applyScores() {
        this.scoreContainer.child.removeAll();
        const rankX = Game.width * 0.2;
        const scoreX = Game.width * 0.8;
        const y = Game.height * 0.25;
        for (let i = 0; i < shared.highscores.length; i++) {
            const score = shared.highscores[i];
            const labelRank = new Label(`${(i + 1).toString().padStart(2, ' ')}:`, rankX, y + i * (cfg.fontSize.medium * 1.125), { valign: 1 });
            const labelScore = new Label(`${score.point}`, scoreX, y + i * (cfg.fontSize.medium * 1.125), { align: 2, valign: 1 });
            if (this.isNewRecord && i === this.rank) {
                labelRank.color.setColor(cfg.theme.highlite);
                labelRank.color.blink(0.5);
            }
            this.scoreContainer.child.add(labelRank);
            this.scoreContainer.child.add(labelScore);
        }
    }
    *coroDefault() {
        Game.pushScene(this);
        while (true) {
            yield undefined;
            if (Game.input.isPress('x')) break;
            if (Game.input.isPress('c')) {
                if (this.isNewRecord) break;
                switch (yield* new SceneConfirm(text.highscore_clear_confirm, [text.done, text.cancel], { isPause: true, isDialog: true }).coroDefault(1)) {
                    case text.done:
                        shared.clearHighscore();
                        shared.save(cfg.saveData.name);
                        this._applyScores();
                        break;
                }
            }
        }
        Game.popScene();
        return;
    }
}
class SceneCredit extends Mono {//クレジット画面
    constructor() {
        super(Coro, Child);
        this.coroId = this.coro.start(this.coroScroll());
    }
    update() {
        if (Game.input.isDown('z')) {
            Game.time.fastForward = 4;
        } else {
            Game.time.resetTimescale();
        }
    }
    *coroDefault() {
        Game.pushScene(this);
        while (true) {
            yield undefined;
            if (Game.input.isPress('x')) break;
            if (this.coro.has(this.coroId)) continue;
            break;
        }
        Game.popScene();
        return;
    }
    *coroScroll() {
        const addText = (label, time = 1) => {
            label.addMix(CreditScroll);
            label.creditscroll.set();
            this.child.add(label);
            return waitForTime(time);
        }
        const createLabel = (text, { x = Game.width * 0.50, y = 0, size = cfg.fontSize.normal, color = cfg.theme.text, align = 1 } = {}) => new Label(text, x, y, { size: size, color: color, align: align, valign: 1 });
        const createHeader = (text, time = 1, color = cfg.theme.highlite) => addText(createLabel(text, { size: cfg.fontSize.medium, color: color }), time);
        const createText = (text, time = 1) => addText(createLabel(text), time);
        const createName = (text, isRight = false) => addText(createLabel(text, { x: Game.width * (0.45 + (Number(isRight) * 0.1)), align: Number(!isRight) * 2 }));
        //キャプション
        yield* createHeader(text.title, 0.6);
        yield* createHeader(text.title2, undefined, cfg.theme.text);
        yield* createText(text.credit, 1.5);
        //スタッフ
        yield* createHeader(text.staff);
        for (const staff of text.staffs) {
            createName(staff);
            yield* createName(text.author, true);
        }
        //キャスト
        yield* createHeader(text.cast);
        const createPortrait = (data) => addText(new Label(Util.parseUnicode(data.char), Game.width * 0.75, 0, { size: data.size, color: data.color, font: cfg.font.emoji.name, align: 1, valign: 1 }));
        for (const cast of Object.values(datas.baddies)) {
            createPortrait(cast);
            yield* createName(cast.showname);
        }
        yield* waitForFrag(() => this.child.objs.length === 0);
        yield* waitForTime(1);
    }
}
class CreditScroll {//クレジットのスクロールコンポーネント
    static requires = Move;
    set(scrolltime = 8) {
        const pos = this.owner.pos;
        pos.y = Game.height * 1.1;
        this.owner.move.set(0, Game.height / -scrolltime);
    }
    update() {
        if (this.owner.pos.bottom <= 0) {
            this.owner.remove();
        }
    }
}
const text = {//テキスト
    done: '決定', cancel: '取消',
    title: 'シューティングゲーム', title2: 'のようなもの', presskey: 'Zキーを押してね',
    explanation1: '↑↓←→:選択、移動',
    explanation2: 'Z:決定、ショット　X:取消、ボム',
    explanation3: 'C:一時停止',
    title_copyright: '©2026 HAGURE YOUMA All rights reserved.',
    nextStage: 'Xキーで次へ',
    start: 'スタート', highscore: 'ハイスコア', credit: 'クレジット', staff: 'スタッフ', cast: 'キャスト',
    pause: 'ポーズ', resume: 'ゲームを続ける', restart: '最初からやり直す', returntitle: 'タイトルに戻る',
    stageclear: 'ステージ　クリア', total: '合計', stage: 'ステージ', time: 'タイム', point: 'スコア', ko: '撃破数',
    gameover: 'ゲームオーバー', continue: 'コンティニュー',
    highscore_clear_key: 'Cキーでハイスコア消去',
    highscore_clear_confirm: 'ハイスコアを消去します。\nよろしいですか？',
    staffs: ['制作', 'プログラム', 'グラフィック', 'テストプレイ'],
    author: 'はぐれヨウマ'
};
class CharaData {//キャラデータ
    static type = { player: 'player', baddie: 'baddie', bomb: 'bomb', item: 'item' };
    constructor(type, name, showname, char, color, size, hp, point, { defeatEffect = undefined, isOutOfScreenToRemove = true, routine = '', forms = undefined, bomb = 0 } = {}) {
        this.type = type;
        this.name = name;
        this.showname = showname;
        this.char = char;
        this.color = color;
        this.size = size;
        this.hp = hp;
        this.point = point;
        this.defeatEffect = defeatEffect;
        this.isOutOfScreenToRemove = isOutOfScreenToRemove;
        this.routine = routine;
        this.forms = forms;
        this.bomb = bomb;
    }
}
const color = {
    text: '#F4EEF7',
    texthighlight: '#ffd417',
    highsky: '#8581D0',
    lowsky: '#E6C4DC',
    cloud: '#BBA2DA',
    moon: '#ffffff',
    chara: {
        black: '#1d1729',
        yellow: '#ffd417'
    },
    bullet: {
        PlayerNormal: '#8FE3E8',
        PlayerPower1: '#e88fe8',
        enemyNormal1: '#ff1717',
        enemyNormal2: '#ffd417',
        enemyNormal3: '#17ffa6',
        enemyAim: '#17f0ff',
        enemyGuided: '#f4e4f5'
    },
    item: {
        playerShield1: '#8fe8b4',
    }
};
const datas = {//ゲームデータ
    color: color,
    unit: {
        defaultSpawnEffect: 'star',
        defaultDefeatEffect: 'star2',
        effects: {
            star: {
                emoji: EMOJI.STAR,
                color: 'Yellow',
                isRandomAngle: false,
                count: 5,
                timeFactor: 0.00675,
                rotate: 0,
                isConverge: true,
            },
            star2: {
                emoji: EMOJI.STAR,
                color: 'yellow',
                isRandomAngle: false,
                count: 5,
                timeFactor: 0.0125,
                rotate: 0,
                isConverge: false,
            },
            feather: {
                emoji: EMOJI.FEATHER,
                color: '',
                isRandomAngle: true,
                count: 7,
                timeFactor: 0.0125,
                rotate: 360,
                isConverge: false,
            }
        }
    },
    baddies: {
        obake: new CharaData(CharaData.type.baddie, 'obake', 'Obake', EMOJI.GHOST, '#F5F5F5', 40, 5, 200, { defeatEffect: 'star2', routine: 'obake', forms: ['randomtop'] }),
        crow: new CharaData(CharaData.type.baddie, 'crow', 'Crow', EMOJI.CROW, color.chara.black, 40, 5, 100, { defeatEffect: 'feather', routine: 'crow', forms: ['v', 'delta', 'tri', 'inverttri', 'abrest', 'randomtop'] }),
        dove: new CharaData(CharaData.type.baddie, 'dove', 'Dove', EMOJI.DOVE, color.chara.black, 40, 5, 100, { defeatEffect: 'feather', routine: 'dove', forms: ['trail', 'randomtop'] }),
        crossdove: new CharaData(CharaData.type.baddie, 'crossdove', 'Cross Dove', EMOJI.DOVE, color.chara.black, 40, 5, 100, { defeatEffect: 'feather', routine: 'crossdove', forms: ['left', 'right', 'randomside'] }),
        bigcrow: new CharaData(CharaData.type.baddie, 'bigcrow', 'Big Crow', EMOJI.CROW, color.chara.black, 80, 20, 100, { defeatEffect: 'feather', routine: 'bigcrow', forms: ['topsingle'] }),
        greatcrow: new CharaData(CharaData.type.baddie, 'greatcrow', 'Great Crow', EMOJI.CROW, color.chara.black, 120, 300, 5000, { defeatEffect: 'feather', isOutOfScreenToRemove: false, routine: 'boss1', forms: ['topsingle'] }),
        minioncrow: new CharaData(CharaData.type.baddie, 'minioncrow', 'Minion Crow', EMOJI.CROW, color.chara.black, 40, 10, 200, { defeatEffect: 'feather', isOutOfScreenToRemove: false, routine: 'boss1minion', forms: ['within'] }),
        greatdove: new CharaData(CharaData.type.baddie, 'greatdove', 'Great Dove', EMOJI.DOVE, color.chara.black, 120, 300, 5000, { defeatEffect: 'feather', isOutOfScreenToRemove: false, routine: 'boss2', forms: ['topsingle'] }),
        miniondove: new CharaData(CharaData.type.baddie, 'miniondove', 'Minion Dove', EMOJI.DOVE, color.chara.black, 40, 10, 200, { defeatEffect: 'feather', isOutOfScreenToRemove: false, routine: 'boss2minion', forms: ['within'] }),
    },
    bosses: ['greatcrow', 'greatdove'],
    player: {
        data: new CharaData(CharaData.type.player, 'player', 'Cat', EMOJI.CAT, color.chara.black, 40, 1, 0, { defeatEffect: 'star2' }),
        moveSpeed: 300,
        bulletSpeed: 600,
        firelate: 1 / 20,
        damagedInvincibilityTime: 1,
    },
    items: {
        bomb: new CharaData(CharaData.type.bomb, 'bomb', 'Bomb', EMOJI.BOMB, color.chara.black, 20, 0, 1000, { defeatEffect: 'star2', routine: 'bomb', bomb: 1 }),
        powerupShot1: new CharaData(CharaData.type.item, 'powerupShot1', 'Fast Spred Shot', EMOJI.GIFT, color.bullet.PlayerPower1, 20, 0, 1000, { defeatEffect: 'star2', routine: 'powerupShot1' }),
        powerupShield1: new CharaData(CharaData.type.item, 'powerupShield1', 'Over Shield', EMOJI.GIFT, color.item.playerShield1, 20, 0, 1000, { defeatEffect: 'star2', routine: 'powerupShield1' }),
    },
    game: {
        highscoreListMax: 10,
        extendedScore: 100000,
        defaultRemains: 2,
        defaultBombs: 2
    }
};
class scoreData {//スコアデータ
    constructor(from) {
        this.stage = from?.stage || 1;
        this.time = from?.time || 0;
        this.point = from?.point || 0;
        this.ko = from?.ko || 0;
        this.remains = from?.remains || datas.game.defaultRemains;
        this.bomb = from?.bomb || datas.game.defaultBombs;
    }
    dif(other) {
        const result = new scoreData(this);
        result.time = Math.floor(result.time - other.time);
        result.point -= other.point;
        result.ko -= other.ko;
        return result;
    }
}
class saveData {//セーブデータ
    constructor() {
        this.highscores = [];
    }
}
class sharedData {//共用データ
    constructor() {
        this.reset();
    }
    reset() {
        this.playdata = {
            total: new scoreData(),
            backup: new scoreData()
        };
        this.highscores = [];
    }
    save(key) {
        const data = new saveData();
        data.highscores = this.highscores;
        Game.save(data, key)
    }
    load(key) {
        const data = Game.load(key);
        if (!data) return;
        this.highscores = data.highscores;
    }
    clearHighscore() {
        this.highscores = [];
    }
    getCurrentStat() {
        return this.playdata.total.dif(this.playdata.backup);
    }
}
const shared = new sharedData()//共用データ変数
//ゲーム実行
Game.run(SceneTitle);