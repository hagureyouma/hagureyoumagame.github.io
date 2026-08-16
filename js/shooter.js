//シューティングゲームのようなもの
//by はぐれヨウマ

{//Javascriptメモ
    //動的言語だからか入力補完があまり効かなくて不便～
    //thisは.の左のオブジェクトのこと！thisを固定するにはbindやCallする　アロー関数=>のthisは変わらないよ
    //ゲッター・セッターはアロー関数=>に未対応
    //スプレッド構文[1,...配列A,2...配列B]
    //Mapは名前で読み書きできる配列
    //ジェネレーター構文*method(){}関数を中断と再開できる アロー関数=>はない
    //jsファイルを後から読み込むには、script要素を追加してonloadイベントで待つのがいい？
    //a=yield 1;→b=generator.next();でbに1が返ってきて、続けてgenerator.next(2)でaに2が返ってくる　yieldの外と変数のやり取りができる
    //非同期 new Promise((resolve){非同期にやりたいこと;resolve();}).then(){非同期が終わってから呼ばれる};
    //async関数はresolveが呼んであるPromiseオブジェクトをreturnするよ
    //webフォントの読み込み待ちはonloadイベントでできないみたいなのでWebFontLoaderを使った
    //プロパティをコンストラクタで定義するのとインスタンスに後から追加するのは、なにか違いがあるの？
}
{//仕様メモ
    //毎フレームの処理の順序　オブジェクトツリーのルートから順に、update→コンポーネントundate→postupdate　draw→コンポーネントdraw
}
{//やりたいことメモ
    //残像の色変更　HSV色空間とグラデーションマップがいる
}
'use strict';
console.clear();

import { EMOJI, game, Util, Mono, Coro, wait, waitForFrag, waitForTime, waitForTimeOrFrag, Child, Pos, Scale, Move, Anime, Ease, Guided, Collision, Brush, Tofu, Moji, Label, Particle, Gauge, OutOfRangeToRemove, OutOfScreenToRemove, Menu, Watch, Color, through } from "./youma.js";

class Unit {//ユニットコンポーネント
    static requieds = [Coro, Pos, Scale, Move, Collision, Color];
    constructor(owner) {
        this.action = new UnitAction(owner);
        this.reset();
    }
    reset() {
        this.hp = 1;
        this.invincible = this.firing = false;
        this.data = this.scene = this.onBanish = this.onDefeat = undefined;
        this.coroSpawn = this.coroSpawnDefault;
        this.coroDefeat = this.coroDefeatDefalut;
        this.action.reset();
    }
    set(data, scene) {
        this.reset();
        this.scene = scene;
        if (!data) return;
        this.data = data;
        this.hp = data.hp;
        this.owner.addMix(data.isOutOfScreenToRemove ? OutOfScreenToRemove : OutOfRangeToRemove, true);
        this.owner.coro.start(this.coroSpawn(), 'main');
    }
    resetHp() {
        this.hp = this.data.hp;
    }
    isBanish() {
        return !this.invincible && this.hp > 0;
    }
    banish(damage) {
        this.hp = Math.max(this.hp - damage, 0);
        if (this.hp > 0) {
            this.owner.color.flash('crimson');
            this.onBanish?.();
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
        this.scene.effect.emittCircle(count, size * 1.5, time, particleSize, color, x, y, isConverge, { emoji: emoji, isRandomAngle: isRandomAngle, rotate: rotate });
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
        this.owner.coro.stop('special');
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
        if (this.data.type === CharacterData.type.baddie) this.scene.addKo();
        if (this.data.type === CharacterData.type.bomb) shared.playdata.total.bomb++;
        this.onDefeat?.();
    }
    get hpRatio() { return this.hp / this.data.hp; };
    update() {
        this.action.update();
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
        if (this.horming != 0 && this.target.isExist) {
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
            let distance = Util.distanse(x, y);
            if (distance > 0) {
                x /= distance;
                y /= distance;
            }
            let speed = this.horming + (distance * 0.25);
            let vx = this.baseX;
            let vy = this.baseY;
            if (this.baseX * x >= 0) vx += x * speed;
            if (this.baseY * y >= 0) vy += y * speed;
            pos.x += vx * game.delta;
            pos.y += vy * game.delta;
        }
    }
}
class Player extends Mono {//自機
    constructor() {
        super(Unit, Moji);
    }
    set(scene) {
        this.resetMix();
        const data = datas.player.data;
        this.unit.set(data, scene);
        this.unit.onBanish = () => {
            this.coro.start(this.coroDamagedInvincible(), 'special');
        };
        this.moji.set(Util.parseUnicode(data.char), game.width * 0.5, game.height - (data.size * 0.5), { size: data.size, color: data.color, font: game.cfg.font.emoji.name, align: 1, valign: 1 });
        this.collision.set(this.pos.width * 0.25, this.pos.height * 0.25);
        this.unit.coroDefeat = this.coroDefeat.bind(this);
    }
    postUpdate() {
        const halfX = this.pos.width * 0.5;
        const halfY = this.pos.height * 0.5;
        this.pos.x = Util.clamp(halfX, this.pos.x, game.width - halfX);
        this.pos.y = Util.clamp(halfY, this.pos.y, game.height - halfY);
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
        this.coro.start(this.coroShot());
        this.coro.start(this.coroBomb());
        while (true) {
            yield undefined;
            this.move.vx = this.move.vy = 0;
            if (game.input.isDown('left')) this.move.vx = -datas.player.moveSpeed;
            if (game.input.isDown('right')) this.move.vx = datas.player.moveSpeed;
            if (game.input.isDown('up')) this.move.vy = -datas.player.moveSpeed;
            if (game.input.isDown('down')) this.move.vy = datas.player.moveSpeed;
            if (this.move.vx !== 0 && this.move.vy !== 0) {
                this.move.vx *= Util.naname;
                this.move.vy *= Util.naname;
            }
        }
    }
    *coroShot() {
        yield* waitForTime(0.2);
        const speed = datas.player.bulletSpeed;
        const point = 100;
        const shotOption = { deg: 90, count: 1, speed: speed, color: 'lime', point: point };
        const shotOption2 = { deg: 85, count: 1, speed: speed, color: 'lime', point: point };
        const shotOption3 = { deg: 95, count: 1, speed: speed, color: 'lime', point: point };
        while (true) {
            yield undefined;
            if (!game.input.isDown('z')) {
                continue;
            }
            const bullets = this.unit.scene.playerbullets;
            bullets.mulitWay(this.pos.x + 10, this.pos.y, shotOption);
            bullets.mulitWay(this.pos.x + 10, this.pos.y, shotOption2);
            bullets.mulitWay(this.pos.x - 10, this.pos.y, shotOption);
            bullets.mulitWay(this.pos.x - 10, this.pos.y, shotOption3);
            yield* waitForTime(0.125);
        }
    }
    *coroBomb() {
        yield* waitForTime(0.2);
        while (true) {
            yield undefined;
            if (!game.input.isDown('c')) {
                continue;
            }
            if (shared.playdata.total.bomb <= 0) continue;
            shared.playdata.total.bomb--;
            this.unit.scene.playerbomb.drop(this.pos.linkX, this.pos.linkY);
            yield* waitForTime(1);
        }
    }
    *coroDamagedInvincible() {
        this.unit.invincible = true;
        yield undefined;
        this.color.blink(0.03);
        yield* waitForTime(datas.player.damagedInvincibilityTime);
        this.color.restore();
        this.unit.invincible = false;
    }
    *coroDefeat() {
        this.unit.playDefeatEffect();
        this.unit.defeatRequied();
        this.isExist = false;
    }
}
class Spawner {//敵キャラ出現
    static form = {
        within: 'within',
        circle: 'circle',
        topsingle: 'topsingle',
        v: 'v',
        delta: 'delta',
        tri: 'tri',
        inverttri: 'inverttri',
        trail: 'trail',
        abrest: 'abrest',
        topsingle: 'topsingle',
        left: 'left',
        right: 'right',
        randomtop: 'randomtop',
        randomside: 'randomside'
    };
    constructor() {
        this.formMap = {
            [Spawner.form.within]: (x, y, n, s, size, space, baseY) => this.singleform(x, y, n, s, size, space, baseY),
            [Spawner.form.circle]: (x, y, n, s, size, space, baseY) => this.circleform(x, y, n, s, size, space, baseY),
            [Spawner.form.topsingle]: (x, y, n, s, size, space, baseY) => this.singleform(x, y, n, s, size, space, baseY, true),
            [Spawner.form.v]: (x, y, n, s, size, space, baseY) => this.vform(x, y, n, s, size, space, baseY),
            [Spawner.form.delta]: (x, y, n, s, size, space, baseY) => this.vform(x, y, n, s, size, space, baseY, true),
            [Spawner.form.tri]: (x, y, n, s, size, space, baseY) => this.triform(x, y, n, s, size, space, baseY),
            [Spawner.form.inverttri]: (x, y, n, s, size, space, baseY) => this.triform(x, y, n, s, size, space, baseY, true),
            [Spawner.form.trail]: (x, y, n, s, size, space, baseY) => this.trailform(x, y, n, s, size, space, baseY),
            [Spawner.form.abrest]: (x, y, n, s, size, space, baseY) => this.abrestform(x, y, n, s, size, space, baseY),
            [Spawner.form.left]: (x, y, n, s, size, space, baseY) => this.sideform(x, y, n, s, size, space, baseY),
            [Spawner.form.right]: (x, y, n, s, size, space, baseY) => this.sideform(x, y, n, s, size, space, baseY, true),
            [Spawner.form.randomtop]: (x, y, n, s, size, space, baseY) => this.randomform(x, y, n, s, size, space, baseY),
            [Spawner.form.randomside]: (x, y, n, s, size, space, baseY) => this.randomform(x, y, n, s, size, space, baseY, true),
        };
    }
    spawn(container, type, x, y, data, pattern, bullets, scene, parent, isPlaySpawnEffect) {
        const bad = container.child.pool(type).set(x, y, data, pattern, bullets, scene, parent);
        if (isPlaySpawnEffect) bad.unit.playSpawnEffect();
        return bad;
    }
    formation(container, type, formationType, x, y, n, s, data, pattern, bullets, scene, parent, isPlaySpawnEffect = false) {
        //xまたはyは-1にするとランダムになるよ
        const size = data.size;
        return this.formMap[formationType](x, y, n, s, size, size + size * (s > 0 ? s : 0.25), -size).map(([bx, by]) => this.spawn(container, type, bx, by, data, pattern, bullets, scene, parent, isPlaySpawnEffect));
    }
    singleform(x, y, n, s, size, space, baseY, isTop = false) {
        if (x < 0) x = Util.rand(game.width - size) + size * 0.5;
        if (y < 0) y = Util.rand(game.width - size) + size * 0.5;
        if (isTop) y = baseY;
        return [[x, y]];
    }
    circleform(x, y, n, s, size, space, baseY) {
        const poss = [];
        const d = s > 0 ? s : size * 2;
        const deg = 360 / n;
        for (let i = 0; i < n; i++) {
            poss.push([Util.degToX(deg * i) * d, Util.degToY(deg * i) * d]);
        }
        return poss;
    }
    vform(x, y, n, s, size, space, baseY, isReverse = false) {
        const poss = [];
        const row = Math.floor(n * 0.5) + 1;
        if (x < 0) {
            const w = space * (row * 2 - 1);
            x = Util.rand(game.width - w) + w * 0.5;
        }
        for (let i = 0; i < row; i++) {
            const col = isReverse ? (row - 1) - i : i;
            if (col !== 0) poss.push([x - (space * col), baseY - space * i]);
            poss.push([x + (space * col), baseY - space * i]);
        }
        return poss;
    }
    triform(x, y, n, s, size, space, baseY, isReverse = false) {
        const poss = [];
        const row = Math.floor(n * 0.5) + 1;
        if (x < 0) {
            const w = space * (row * 2 - 1);
            x = Util.rand(game.width - w) + w * 0.5;
        }
        for (let i = 0; i < row; i++) {
            const k = isReverse ? (row - 1) - i : i;
            const col = k * 2 + 1;
            for (let j = 0; j < col; j++) {
                poss.push([x - (space * k) + (space * j), baseY - space * i]);
            }
        }
        return poss;
    }
    trailform(x, y, n, s, size, space, baseY) {
        const poss = [];
        if (x < 0) x = Util.rand(game.width - size) + size * 0.5;
        for (let i = 0; i < n; i++) {
            poss.push([x, baseY - space * i]);
        }
        return poss;
    }
    abrestform(x, y, n, s, size, space, baseY) {
        const poss = [];
        if (x < 0) {
            const w = space * n;
            x = Util.rand(game.width - w) + size * 0.5;
        }
        for (let i = 0; i < n; i++) {
            poss.push([x + (space * i), baseY]);
        }
        return poss;
    }
    sideform(x, y, n, s, size, space, baseY, isR = false) {
        const poss = [];
        if (y < 0) {
            const h = (space) * n;
            y = Util.rand(game.width - h) + size * 0.5;
        }
        x = isR ? game.width + size : -size;
        const w = Math.sign(x) * size * 0.5;
        for (let i = 0; i < n; i++) {
            poss.push([x + (w * i), y + ((space) * i)]);
        }
        return poss;
    }
    randomform(x, y, n, s, size, space, baseY, isSide = false) {
        const poss = [];
        const max = Math.floor(isSide ? (game.height * 0.6) / space : (game.width / space) - 1);
        const ps = Util.randomArray(max, Util.rand(Math.min(n, max), 1));
        for (const p of ps) {
            if (!isSide) {
                poss.push([space * (p + 1), baseY + -Util.rand(size)]);
            } else {
                const r = Util.rand(1);
                poss.push([r ? game.width + size : -size + (r === 1 ? 1 : -1) * Util.rand(size), space * (p + 1)]);
            }
        }
        return poss;
    }
}
class Baddie extends Mono {//敵キャラ
    static spawnType = { within: 0, top: 1, left: 2, right: 3 };
    constructor() {
        super(Unit, Anime, Moji);
        this.routine = undefined;
    }
    set(x, y, data, pattern, bullets, scene, parent) {
        this.routine = this.routines[data.routine](this, pattern, bullets, scene);
        this.pos.parent = parent;
        this.moji.set(Util.parseUnicode(data.char), x, y, { size: data.size, color: data.color, font: game.cfg.font.emoji.name, align: 1, valign: 1 });
        this.collision.set(this.pos.width, this.pos.height);
        this.unit.set(data, scene);
        return this;
    }
    setAnime(isVirtical) {
        const size = this.pos.width;
        if (isVirtical) {
            this.anime.relativeDegForTime(0, size / 5, size / 240, { easing: Ease.sineout, isLoop: true, isfirstRand: true });
        } else {
            this.anime.relativeDegForTime(90, size / 5, size / 240, { easing: Ease.sineout, isLoop: true, isfirstRand: true });
        }
    }
    *coroAction() {
        yield* this.routine;
    }
    whichSpawnType() {
        let result = Baddie.spawnType.within;
        let isMoveVirtical = false;
        if (this.pos.right < 0) {
            result = Baddie.spawnType.left;
        } else if (this.pos.left >= game.width) {
            result = Baddie.spawnType.right;
        } else if (this.pos.bottom < 0) {
            result = Baddie.spawnType.top;
            isMoveVirtical = true;
        }
        return [result, isMoveVirtical];
    }
    *routineBasicShot(user, pattern, shot) {
        yield* waitForFrag(() => game.screen.isWithin(user.pos.rect)); //画面内に入るまで待機
        yield* waitForTime(Util.rand(60) * game.delta); //ランダムで最大1秒まで待機
        while (true) {
            if (game.screen.isOut(user.pos.rect)) yield undefined; //画面外にいるなら射撃しない
            yield* shot(); //射撃
        }
    }
    *routineBasic(user, pattern, moveSpeed, shot) {
        //射撃
        if (shot) user.coro.start(user.routineBasicShot(user, pattern, shot));
        //移動
        const [spawnType, isAnimeVirtical] = user.whichSpawnType();
        switch (spawnType) {
            case Baddie.spawnType.within:
                user.setAnime(isAnimeVirtical);
                break;
            case Baddie.spawnType.top:
                user.move.set(0, moveSpeed);
                switch (pattern) {
                    case 0:
                        user.setAnime(isAnimeVirtical);
                        break;
                    case 1:
                        user.setAnime(isAnimeVirtical);
                        break;
                }
                break;
            case Baddie.spawnType.left:
                user.setAnime(isAnimeVirtical);
                user.move.set(moveSpeed, 0);
                break;
            case Baddie.spawnType.right:
                user.setAnime(isAnimeVirtical);
                user.move.set(-moveSpeed, 0);
                break;
        }
    }
    routines = {
        zako1: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            yield* user.routineBasic(user, pattern, moveSpeed, function* () {
                bullets.mulitWay(user.pos.linkX, user.pos.linkY, { count: 1, color: 'red' });
                yield* waitForTime(2);
            });
        },
        zako2: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            const shot1 = function* () {
                yield* waitForFrag(() => game.screen.isWithin(user.pos.rect));
                yield* waitForTime(Util.rand(60) * game.delta);
                bullets.mulitWay(user.pos.x, user.pos.y, { color: 'red' });
                yield* waitForTime(2);
            };
            const [spawnType, isAnimeVirtical] = user.whichSpawnType();
            user.setAnime(isAnimeVirtical);
            switch (spawnType) {
                case Baddie.spawnType.left:
                    yield* user.move.relative(0 - user.pos.x, 0, moveSpeed * 2);
                    yield* user.move.relative(game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sineout, min: 0.5 });
                    user.coro.start(user.routineBasicShot(user, pattern, shot1));
                    yield* user.move.relative(game.width * 0.4, 0, moveSpeed, { easing: Ease.liner, min: 0 });
                    yield* user.move.relative(game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sinein, min: 0.5 });
                    yield* user.move.relative(game.screen.range + user.pos.width, 0, moveSpeed * 2);
                    break;
                case Baddie.spawnType.right:
                    yield* user.move.relative(game.width - user.pos.x, 0, moveSpeed * 2);
                    yield* user.move.relative(-game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sineout, min: 0.5 });
                    user.coro.start(user.routineBasicShot(user, pattern, shot1));
                    yield* user.move.relative(-game.width * 0.4, 0, moveSpeed, { easing: Ease.liner, min: 0 });
                    yield* user.move.relative(-game.width * 0.3, 0, moveSpeed * 2, { easing: Ease.sinein, min: 0.5 });
                    yield* user.move.relative(-(game.screen.range + user.pos.width), 0, moveSpeed * 2);
                    break;
                default:
            }
        },
        zako3: function* (user, pattern, bullets, scene) {
            const moveSpeed = 50;
            yield* user.routineBasic(user, pattern, moveSpeed, function* () {
                bullets.mulitWay(user.pos.linkX, user.pos.linkY, { count: 1, color: 'red' });
                yield* waitForTime(2);
            });
        },
        zako4: function* (user, pattern, bullets, scene) {
            const moveSpeed = 200;
            user.unit.action.setGuided(0, 100, scene.player, 100);
        },
        boss1: function* (user, pattern, bullets, scene) {
            //取り巻き召喚
            const minionName = 'torimakicrow';
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
            const summonMinions = function* (name, count, distance) {
                //取り巻きの最大数が違うなら新規に呼び出す
                if (minions.length != count) {
                    removeMinions();
                    minions = scene.spawner.formation(scene.baddies, Baddie.name, Spawner.form.circle, -1, -1, count, distance, minionData, 0, bullets, scene, user, true);
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
                    minions[i] = scene.spawner.spawn(scene.baddies, Baddie.name, Util.degToX(deg) * distance, Util.degToY(deg) * distance, minionData, 0, bullets, scene, user, true);
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
            const circleShot = function* () {
                const count = 24;
                for (let i = 0; i < 6; i++) {
                    bullets.circle(user.pos.x, user.pos.y, { count: count, offset: ((360 / count) * 0.5) * (i % 2) });
                    yield* waitForTime(0.5);
                }
            };
            const spiralShot = function* () {
                const deg = 360 / 6;
                let degOffset = 0;
                for (let i = 0; i < 16; i++) {
                    for (let j = 0; j < 6; j++) {
                        bullets.mulitWay(user.pos.x, user.pos.y, { deg: (deg * j) + degOffset, count: 1, speed: 100, color: 'yellow' });
                    }
                    yield* waitForTime(0.2);
                    degOffset += 18;
                }
            };
            const ringShot = function* () {
                const speed = 500;
                const bulletlist = [
                    ...bullets.circle(user.pos.left, user.pos.y, { speed: 250, count: 12, color: 'aqua', removeOffscreen: false }),
                    ...bullets.circle(user.pos.right, user.pos.y, { speed: 250, count: 12, color: 'aqua', removeOffscreen: false })
                ];
                yield* waitForTime(0.5);
                for (const b of bulletlist) {
                    const [x, y] = Util.normalize(scene.player.pos.x - b.pos.x, scene.player.pos.y - b.pos.y);
                    b.move.set(x * speed, y * speed, 2, 0);
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
                const timeOfs = game.sec;
                for (let i = 0; i < 10; i++) {
                    bullets.mulitWay(user.pos.x, user.pos.y, { deg: 270 + (rangeDeg * Util.degToX((game.sec - timeOfs) * radiantSpeed)), count: count, speed: bulletSpeed, color: 'yellow' });
                    yield* waitForTime(0.3);
                }
            };
            const fanShotParallel = function* (count = 3, rangeDeg = 15, radiantSpeed = 180, bulletSpeed = 400) {
                const timeOfs = game.sec;
                for (let i = 0; i < 18; i++) {
                    bullets.mulitWay(user.pos.left, user.pos.y, { deg: 260 + (rangeDeg * Util.degToX((game.sec - timeOfs) * radiantSpeed)), space: 7, count: count, speed: bulletSpeed, color: 'orange' });
                    bullets.mulitWay(user.pos.right, user.pos.y, { deg: 280 + (rangeDeg * Util.degToX((game.sec - timeOfs) * radiantSpeed)), space: 7, count: count, speed: bulletSpeed, color: 'orange' });
                    yield* waitForTime(0.125);
                }
            };
            const guidedShot = function* () {
                for (let j = 0; j < 3; j++) {
                    bullets.mulitWay(user.pos.x, user.pos.y, { deg: 90, space: 25, count: 4, speed: 500, firstSpeed: 0, accelTime: 3, color: 'white', guided: scene.player, guidedSpeed: 2 });
                    yield* waitForTime(1);
                }
            };
            const multiwayShot = function* () {
                while (true) {
                    yield undefined;
                    for (let i = 0; i < 8; i++) {
                        bullets.mulitWay(user.pos.x, user.pos.y, { count: 3, speed: 400, color: 'orange' });
                        yield* waitForTime(0.05);
                    }
                    yield* waitForTime(2);
                }
            };
            //ボスの移動
            const resetPos = function* () {
                yield* user.move.to(game.width * 0.5, game.height * 0.3, 100, { easing: Ease.sineInOut });
            };
            const randPos = function* () {
                const x = Util.rand(game.width - user.pos.width) + (user.pos.width * 0.5);
                const y = Util.rand((game.height * 0.6) - user.pos.height) + (user.pos.height * 0.5);
                yield* user.move.to(x, y, 100, { easing: Ease.sineInOut });
            };
            //ここからボスの動作
            yield* resetPos();
            let shotList = [fanShot, ringShot, guidedShot];
            let currentShot = 0;
            while (user.unit.hpRatio > 0.5) {
                if (currentShot === 0) yield* summonMinions(minionName, 7, user.pos.width * 0.75);
                yield* user.coro.startAndGetWaitForFrag(shotList[currentShot]());
                if (!(user.unit.hpRatio > 0.5)) break;
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
            while (user.unit.hpRatio > 0.25) {
                if (currentShot === 0) yield* summonMinions(minionName, 9, user.pos.width * 0.75);
                yield* user.coro.startAndGetWaitForFrag(shotList[currentShot]());
                if (!(user.unit.hpRatio > 0.25)) break;
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
                const spiralId = user.coro.start(spiralShot());
                yield* waitForTime(0.8);
                const circleId = user.coro.start(circleShot());
                yield* user.coro.wait(spiralId, circleId);
                yield* waitForTime(2);
            }
        },
        boss1torimaki: function* (user, pattern, bullets, scene) {
            user.move.setRevo(60);
            yield* waitForTime(Util.rand(60) * game.delta);
            while (true) {
                const r = Util.rand(100);
                if (r > 70) {
                    bullets.mulitWay(user.pos.linkX, user.pos.linkX, { count: 1, color: 'aqua', aim: scene.player });
                } else {
                    bullets.mulitWay(user.pos.linkX, user.pos.linkY, { count: 1, color: 'red' });
                }
                yield* waitForTime(3);
            }
        },
        item1: function* (user, pattern, bullets, scene) {
            const moveSpeed = 100;
            user.move.set(0, moveSpeed);
        },
    };
}
class Bullet {//弾コンポーネント
    constructor() {
        this.reset();
    }
    reset() {
        this.set(1, 0)
    }
    set(damage, point, through = false) {
        this.damage = damage;
        this.point = point;
        this.through = through;
    }
}
class BulletBox extends Mono {//弾
    constructor() {
        super(Child);
        this.child.drawlayer = 'effect';
        this.child.addCreator('bullet', () => new Mono(Guided, Collision, Brush, Bullet));
    }
    firing(x, y, vx, vy, firstSpeed, accelTime, color, damage, point, removeOffscreen) {
        const bullet = this.child.pool('bullet');
        bullet.addMix(removeOffscreen ? OutOfScreenToRemove : OutOfRangeToRemove, true);
        bullet.pos.set(x, y, 8, 8);
        bullet.pos.align = 1;
        bullet.pos.valign = 1;
        bullet.move.set(vx, vy);
        bullet.move.setChangeSpeed(accelTime, firstSpeed);
        bullet.collision.set(6, 6);
        bullet.color.setColor(color);
        bullet.brush.circle();
        bullet.bullet.set(damage, point);
        return bullet;
    }
    mulitWay(x, y, { deg = 270, space = 30, count = 3, speed = 150, firstSpeed = 0, accelTime = 0, color = 'red', aim = undefined, guided = undefined, guidedSpeed = 0, damage = 1, point = 0, removeOffscreen = true } = {}) {
        let d = deg;
        if (aim) d = Util.xyToDeg(aim.pos.x - x, aim.pos.y - y);
        const offset = space * (count - 1) / 2;
        const result = [];
        for (let i = 0; i < count; i++) {
            const bullet = result[i] = this.firing(x, y, Util.degToX(((d - offset) + (space * i)) % 360) * speed, Util.degToY(((d - offset) + (space * i)) % 360) * speed, firstSpeed, accelTime, color, damage, point, removeOffscreen);
            if (guided) bullet.guided.set(guided, guidedSpeed, 0, 2);
        }
        return result;
    }
    circle(x, y, { count = 36, offset = 0, speed = 150, firstSpeed = 0, accelTime = 0, color = 'red', damage = 1, point = 0, removeOffscreen = true } = {}) {
        const d = 360 / count;
        const result = [];
        for (let i = 0; i < count; i++) {
            result[i] = this.firing(x, y, Util.degToX((d * i + offset) % 360) * speed, Util.degToY((d * i + offset) % 360) * speed, firstSpeed, accelTime, color, damage, point, removeOffscreen);
        }
        return result;
    }
}
class Bomb extends Mono {
    constructor() {
        super(Coro, Pos, Scale, Collision, Brush, Bullet);
    }
    set(x, y) {
        this.pos.set(x, y, game.height * 2, game.height * 2);
        this.pos.align = 1;
        this.pos.valign = 1;
        this.scale.set(0, 0);
        this.collision.isCircle = true;
        this.brush.circle();
        this.color.setColor('white');
        this.update = () => {
            this.color.alpha = 1 - this.scale.ease.percentage;
        };
        this.bullet.set(10, 100, true);
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
        this.child.drawlayer = 'be';
        this.child.addCreator('bomb', () => new Bomb());
    }
    drop(x, y) {
        const bomb = this.child.pool('bomb');
        bomb.set(x, y);
    }
}
class SceneTitle extends Mono {//タイトル画面
    constructor() {
        super(Child);
        //タイトル
        const titleY = game.height * 0.25;
        this.child.add(new Label(text.title, game.width * 0.5, titleY, { size: game.cfg.fontSize.large, color: game.cfg.theme.highlite, align: 1, valign: 1 }));
        this.child.add(new Label(text.title2, game.width * 0.5, titleY + game.cfg.fontSize.large * 1.5, { size: game.cfg.fontSize.large, align: 1, valign: 1 }));
        //ボタンを押してね
        this.child.add(this.presskey = new Label(text.presskey, game.width * 0.5, game.height * 0.5 + game.cfg.fontSize.medium * 1.5, { size: game.cfg.fontSize.medium, align: 1, valign: 1 }));
        //コピーライト表示
        this.child.add(new Label(text.title_copyright, game.width * 0.5, game.height - game.cfg.fontSize.small, { size: game.cfg.fontSize.small, align: 1, valign: 2 }));
        //メニュー
        this.child.add(this.titleMenu = new SceneTitleMenu(this));
        game.setCoroutine(this.coroDefault());
    }
    *coroDefault() {
        this.presskey.color.blink(0.5);
        while (true) {
            yield undefined;
            if (!game.input.isPress('z')) continue;
            this.presskey.isExist = false;
            yield* this.titleMenu.coroDefault();
            this.presskey.isExist = true;
            this.presskey.color.blink(0.5);
        }
    }

}
class SceneTitleMenu extends Mono {
    constructor(owner) {
        super(Child);
        this.owner = owner;
        this.isExist = false;
        //メニュー
        this.child.add(this.menu = new Menu(game.width * 0.5, game.height * 0.5, game.cfg.fontSize.medium, { isEnableCancel: true }));
        this.menu.add(text.start);
        this.menu.add(text.highscore);
        this.menu.add(text.credit);
        //操作方法
        this.child.add(this.explanation1 = new Label(text.explanation1, game.width * 0.5, game.height - (game.cfg.fontSize.normal * 3), { align: 1, valign: 2 }));
        this.child.add(this.explanation2 = new Label(text.explanation2, game.width * 0.5, game.height - game.cfg.fontSize.normal * 2, { align: 1, valign: 2 }));
    }
    *coroDefault() {
        this.isExist = true;
        while (true) {
            const result = yield* this.menu.coroSelect();
            if (!result) {
                this.isExist = false;
                return;
            }
            this.owner.isExist = false;
            if (result === text.start) yield* new ScenePlay().coroDefault();
            if (result === text.highscore) yield* new SceneHighscore().coroDefault();
            if (result === text.credit) yield* new SceneCredit().coroDefault();
            this.owner.isExist = true;
        }
    }
}
class ScenePlay extends Mono {//プレイ画面
    constructor() {
        super(Coro, Child);
        this.isClear = false;
        this.extendedScore = 0;
        this.spawner = new Spawner();
        //自機
        this.child.add(this.playerside = new Mono(Child));
        this.playerside.child.addCreator(Player.name, () => new Player());
        //敵キャラ
        this.child.add(this.baddies = new Mono(Child));
        this.baddies.child.addCreator(Baddie.name, () => new Baddie());
        //アイテム
        this.child.add(this.items = new Mono(Child));
        this.items.child.addCreator(Baddie.name, () => new Baddie());
        //ボム
        this.child.add(this.playerbomb = new BombCarrier());
        //弾
        this.child.add(this.playerbullets = new BulletBox());
        this.child.add(this.baddiesbullets = new BulletBox());
        //パーティクル
        this.child.add(this.effect = new Particle());
        this.effect.child.drawlayer = 'effect';
        //キャラ個別UI
        this.child.add(this.charaUi = new Mono(Child));
        this.charaUi.child.drawlayer = 'ui';
        //画面UI
        this.child.add(this.ui = new Mono(Child));
        //スコア表示
        this.ui.child.drawlayer = 'ui';
        this.ui.child.add(this.textScore = new Label(() => `SCORE ${shared.playdata.total.point} KO ${shared.playdata.total.ko}`, 2, 2));
        //this.ui.child.add(this.fpsView = new Label(() => `FPS: ${game.fps}`, game.width - 2, 2, { align: 2 }));
        this.ui.child.add(this.textStage = new Label(() => `STAGE: ${shared.playdata.total.stage}`, game.width - 2, 2, { align: 2 }));
        //残機表示
        this.ui.child.add(this.remains = new Label(() => this.getRemainsText(), 0, game.cfg.fontSize.normal * 1.25, { color: datas.player.data.color, font: game.cfg.font.emoji.name }));
        //ボム所持数表示
        this.ui.child.add(this.bomb = new Label(() => this.getBombsText(), game.cfg.fontSize.normal * 1.25 * 6, game.cfg.fontSize.normal * 1.25, { color: 'black', font: game.cfg.font.emoji.name }));
        //テロップ
        this.ui.child.add(this.telop = new Label('', game.width * 0.5, game.height * 0.5, { size: game.cfg.fontSize.medium, color: game.cfg.theme.highlite, align: 1, valign: 1 }));
        this.telop.isExist = false;
        //デバッグ表示
        this.child.add(this.debug = new Watch());
        this.debug.add(()=>`${this.baddies.child.liveCount}`);
    }
    getRemainsText = () => {
        const remains = shared.playdata.total.remains;
        if (remains <= 0) return '';
        if (remains <= 5) {
            let text = '';
            for (let i = 0; i < remains; i++) {
                text += Util.parseUnicode(datas.player.data.char);
            }
            return text;
        }
        return `${Util.parseUnicode(datas.player.data.char)}×${remains}`;
    }
    getBombsText = () => {
        const bomb = shared.playdata.total.bomb;
        if (bomb <= 0) return '';
        if (bomb <= 5) {
            let text = '';
            for (let i = 0; i < bomb; i++) {
                text += Util.parseUnicode(EMOJI.BOMB);
            }
            return text;
        }
        return `${Util.parseUnicode(EMOJI.BOMB)}×${bomb}`;
    }
    *showTelop(text, time, blink = 0) {
        this.telop.moji.set(text);
        this.telop.color.blink(blink);
        this.telop.isExist = true;
        yield* waitForTime(time);
        this.telop.isExist = false;
    }
    postUpdate() {
        //キャラ同士の当たり判定
        this.baddies.child.each((baddie) => {
            if (!this.player.collision.hit(baddie)) return;
            if (!this.player.unit.isBanish()) return;
            this.player.unit.banish(1);
        });
        //攻撃の当たり判定
        const _bulletHitcheck = (bullet, targets) => {
            targets.child.each((target) => {
                if (!target.unit.isBanish()) return;
                if (!bullet.collision.hit(target)) return;
                target.unit.banish(bullet.bullet.damage);
                this.addPoint(bullet.bullet.point);
                if (!bullet.bullet.through) bullet.remove();
            });
        }
        //ボムの当たり判定
        this.playerbomb.child.each((bomb) => _bulletHitcheck(bomb, this.baddies));
        this.playerbomb.child.each((bomb) => {
            this.baddiesbullets.child.each((bullet) => {
                if (!bomb.collision.hit(bullet)) return;
                bullet.remove();
            });
        });
        //弾の当たり判定
        this.playerbullets.child.each((bullet) => _bulletHitcheck(bullet, this.baddies));
        this.baddiesbullets.child.each((bullet) => _bulletHitcheck(bullet, this.playerside));
        //自機とアイテムの当たり判定
        this.items.child.each((item) => {
            if (!this.player.collision.hit(item)) return;
            item.unit.banish(1);
        });
    }
    * coroDefault() {
        game.pushScene(this);
        this.newGame();
        while (true) {
            yield undefined;
            if (this.isClear) {//ステージクリアした
                this.player.unit.invincible = true;//クリア後に撃破されないよう無敵にする
                yield* this.showTelop(text.stageclear, 2);
                yield* new SceneClear(shared.getCurrentStat()).coroDefault();
                this.nextStage();
                continue;
            }
            if (this.isFailure) {//負けた
                yield* this.showTelop(text.gameover, 2);
                const [isNewRecord, rank] = this.isNewRecord();
                if (isNewRecord) {
                    shared.save(game.cfg.saveData.name)
                    yield* new SceneHighscore(isNewRecord, rank).coroDefault();
                }
                switch (yield* new SceneConfirm(text.gameover, [text.continue, text.returntitle]).coroDefault()) {
                    case text.continue:
                        this.newGame();
                        break;
                    case text.returntitle:
                        game.popScene();
                        return;
                }
                continue;
            }
            if (game.input.isPress('x')) {//ポーズメニューを開く
                this.isActive = false;
                switch (yield* new SceneConfirm(text.pause, [text.resume, text.restart, text.returntitle], { isPause: true, isEnableCancel: true }).coroDefault()) {
                    case text.restart:
                        this.newGame();
                        break;
                    case text.returntitle:
                        game.popScene();
                        return;
                }
                this.isActive = true;
                continue;
            }
            //経過時間
            shared.playdata.total.time += game.delta;
        }
    }
    * coroStage() {
        const items = ['bomb'];
        const itemSpawnRate = 0.05;
        let itemSpawnCounter = 0;
        const appears = ['crow', 'dove', 'obake', 'bigcrow'];
        const bossName = 'greatcrow';
        const phaseSec = 30;
        const spawnIntervalFactor = 1 * Math.pow(0.9, shared.playdata.total.stage);
        yield* waitForTime(2);
        {//道中
            while (this.elaps <= phaseSec || this.baddies.child.liveCount > 0) {
                yield undefined;
                //敵キャラ出現
                if (this.elaps > phaseSec) continue;
                const baddieName = appears[Util.rand(appears.length - 1)];
                const data = datas.baddies[baddieName];
                const formation = data.forms[Util.rand(data.forms.length - 1)];
                const spawnMax = Math.floor(game.width / data.size) - 2;
                const spawnCount = Util.rand(spawnMax);
                this.spawner.formation(this.baddies, Baddie.name, formation, -1, -1, spawnCount, -1, data, 0, this.baddiesbullets, this, undefined, false);
                yield* waitForTime(Util.rand(spawnCount * spawnIntervalFactor * 0.5, spawnIntervalFactor))
                //アイテム出現    
                if (itemSpawnCounter >= 20 || Util.rand(100) < itemSpawnRate * 100) {
                    itemSpawnCounter = 0;
                    const itemName = items[Util.rand(items.length - 1)];
                    const data = datas.items[itemName];
                    const formation = Spawner.form.topsingle;
                    this.spawner.formation(this.items, Baddie.name, formation, -1, -1, 1, -1, data, 0, undefined, this, undefined, false);
                }
                itemSpawnCounter++;
            }
        }
        yield* this.showTelop('WARNING!', 2, 0.25);
        {//ステージボス登場
            const data = datas.baddies[bossName];
            const formation = data.forms[0];
            const [boss] = this.spawner.formation(this.baddies, Baddie.name, formation, game.width * 0.5, -1, 1, -1, data, 0, this.baddiesbullets, this, 0, undefined);
            const waitForBossDefeat = wait();
            boss.unit.onDefeat = () => {
                waitForBossDefeat.return();
            }
            //ボスのHPゲージ
            const bossHpGauge = new Gauge();
            bossHpGauge.pos.set(game.width * 0.5, 56, game.width * 0.9, 10);
            bossHpGauge.pos.align = 1;
            bossHpGauge.color = game.cfg.theme.text;
            bossHpGauge.max = boss.unit.data.hp;
            bossHpGauge.watch = () => boss.unit.hp;
            this.charaUi.child.add(bossHpGauge);
            //ボスが倒されるまで待機
            yield* waitForBossDefeat;
            bossHpGauge.remove();
        }
        this.isClear = true;
    }
    newGame() {
        shared.playdata.backup = new scoreData();
        shared.playdata.total = new scoreData();
        this.resetStage();
    }
    nextStage() {
        shared.playdata.total.stage++;
        shared.playdata.backup = new scoreData(shared.playdata.total);
        this.resetStage();
    }
    canRespawn() {
        shared.playdata.total.remains--;
        return shared.playdata.total.remains < 0;
    }
    playerSpawn(isRespawn = false) {
        this.player ??= this.playerside.child.pool(Player.name);
        this.player.isExist = true;
        this.player.set(this);
        this.player.unit.onDefeat = () => {
            if (this.canRespawn()) return;
            this.coro.start(function* () {
                yield* waitForTime(1);
                this.playerSpawn(true);
            }.call(this));
        }
        if (isRespawn) {
            this.player.unit.playSpawnEffect();
            this.player.coro.start(this.player.coroDamagedInvincible(), 'special');//リスポーン後の無敵時間
        }
    }
    resetStage() {
        this.isClear = false;
        this.extendedCount = (Math.floor(shared.playdata.total.point / datas.game.extendedScore) + 1) * datas.game.extendedScore;
        this.playerSpawn();
        this.baddies.child.removeAll();
        this.playerbullets.child.removeAll();
        this.baddiesbullets.child.removeAll();
        this.effect.child.removeAll();
        this.charaUi.child.removeAll();
        this.coro.reset();
        this.coro.start(this.coroStage());
        game.layers.get('effect').clearBlur();
        this.telop.isExist = false;
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
    constructor(caption, items, options = {}) {
        const { isEnableCancel = false, isPause = false, isDialog = false } = options;
        super(Child);
        const captionColor = isDialog ? game.cfg.theme.text : game.cfg.theme.highlite;
        this.child.drawlayer = 'ui';
        this.child.add(new Tofu().set(0, 0, game.width, game.height, 'black', 0.5));
        this.child.add(new Label(caption, game.width * 0.5, game.height * 0.25, { size: game.cfg.fontSize.medium, color: captionColor, align: 1, valign: 1 }));
        this.child.add(this.menu = new Menu(game.width * 0.5, game.height * 0.5, game.cfg.fontSize.medium, { isEnableCancel: isEnableCancel }));
        for (const item of items) this.menu.add(item);
        this.isPause = isPause;
    }
    *coroDefault(firtsIndex) {
        game.pushScene(this);
        game.layers.get('effect').isPauseBlur = this.isPause;
        const result = yield* this.menu.coroSelect(firtsIndex);
        game.layers.get('effect').isPauseBlur = false;
        game.popScene();
        return result;
    }
}
class SceneClear extends Mono {//ステージクリア画面
    constructor() {
        super(Child);
        this.child.drawlayer = 'ui';
        this.child.add(new Label(text.stageclear, game.width * 0.5, game.height * 0.25, { size: game.cfg.fontSize.medium, color: game.cfg.theme.highlite, align: 1, valign: 1 }));
        let x = game.width * 0.4;
        const y = game.height * 0.4;
        const line = game.cfg.fontSize.medium * 1.5;
        const stat = shared.getCurrentStat();
        this.child.add(new Label(text.stage, x, y, { align: 2, valign: 1 }));
        this.child.add(new Label(text.time, x, y + line, { align: 2, valign: 1 }));
        this.child.add(new Label(text.point, x, y + (line * 2), { align: 2, valign: 1 }));
        this.child.add(new Label(text.ko, x, y + (line * 3), { align: 2, valign: 1 }));
        x = game.width * 0.8;
        this.child.add(new Label(stat.stage, x, y, { align: 2, valign: 1 }));
        this.child.add(new Label(stat.time, x, y + line, { align: 2, valign: 1 }));
        this.child.add(new Label(stat.point, x, y + (line * 2), { align: 2, valign: 1 }));
        this.child.add(new Label(stat.ko, x, y + (line * 3), { align: 2, valign: 1 }));
        const nextStage = new Label(text.nextStage, game.width * 0.5, game.height - (line * 2), { size: game.cfg.fontSize.medium, align: 1, valign: 1 })
        nextStage.color.blink(0.5);
        this.child.add(nextStage);
    }
    *coroDefault() {
        game.pushScene(this);
        while (true) {
            yield undefined;
            if (game.input.isPress('x')) break;
        }
        game.popScene();
        return;
    }
}
class SceneHighscore extends Mono {//ハイスコア画面
    constructor(isNewRecord = false, rank = -1) {
        super(Child);
        this.isNewRecord = isNewRecord;
        this.rank = rank;
        this.child.drawlayer = 'ui';
        if (this.isNewRecord) this.child.add(new Tofu().set(0, 0, game.width, game.height, 'black', 0.5));
        this.child.add(new Label(text.highscore, game.width * 0.5, game.height * 0.15, { size: game.cfg.fontSize.medium, color: game.cfg.theme.highlite, align: 1, valign: 1 }));
        this.child.add(this.scoreContainer = new Mono(Child));
        this._applyScores();
        if (!this.isNewRecord) this.child.add(this.explanation1 = new Label(text.highscore_clear_key, game.width * 0.5, game.height, { align: 1, valign: 2 }));
    }
    _applyScores() {
        this.scoreContainer.child.removeAll();
        const rankX = game.width * 0.2;
        const scoreX = game.width * 0.8;
        const y = game.height * 0.25;
        for (let i = 0; i < shared.highscores.length; i++) {
            const score = shared.highscores[i];
            const labelRank = new Label(`${(i + 1).toString().padStart(2, ' ')}:`, rankX, y + i * (game.cfg.fontSize.medium * 1.125), { valign: 1 });
            const labelScore = new Label(`${score.point}`, scoreX, y + i * (game.cfg.fontSize.medium * 1.125), { align: 2, valign: 1 });
            if (this.isNewRecord && i === this.rank) {
                labelRank.color.setColor(game.cfg.theme.highlite);
                labelRank.color.blink(0.5);
            }
            this.scoreContainer.child.add(labelRank);
            this.scoreContainer.child.add(labelScore);
        }
    }
    *coroDefault() {
        game.pushScene(this);
        while (true) {
            yield undefined;
            if (game.input.isPress('x')) break;
            if (game.input.isPress('z')) {
                if (this.isNewRecord) break;
                switch (yield* new SceneConfirm(text.highscore_clear_confirm, [text.done, text.cancel], { isPause: true, isDialog: true }).coroDefault(1)) {
                    case text.done:
                        shared.clearHighscore();
                        shared.save(game.cfg.saveData.name);
                        this._applyScores();
                        break;
                }
            }
        }
        game.popScene();
        return;
    }
}
class SceneCredit extends Mono {//クレジット画面
    constructor() {
        super(Coro, Child);
        this.child.drawlayer = 'ui';
        this.coroId = this.coro.start(this.coroScroll());
    }
    *coroDefault() {
        game.pushScene(this);
        while (true) {
            yield undefined;
            if (game.input.isPress('z') || game.input.isPress('x')) break;
            if (this.coro.has(this.coroId)) continue;
            break;
        }
        game.popScene();
        return;
    }
    *coroScroll() {
        const header = new Label(text.credit, game.width * 0.5, 0, { size: game.cfg.fontSize.medium, color: game.cfg.theme.highlite, align: 1, valign: 1 });
        header.addMix(CreditScroll);
        header.creditscroll.set();
        this.child.add(header);
        yield* waitForTime(1);
        for (const staff of text.staff) {
            const label = new Label(staff, game.width * 0.5, 0, { size: game.cfg.fontSize.normal, align: 1, valign: 1 });
            label.addMix(CreditScroll);
            label.creditscroll.set();
            this.child.add(label);
            yield* waitForTime(1);
        }
        while (this.child.count > 0) yield undefined;
        yield* waitForTime(1);
    }
}
class CreditScroll {//クレジットのスクロールコンポーネント
    static requieds = Move;
    constructor() {
        return this;
    }
    set(scrolltime = 8) {
        const pos = this.owner.pos;
        pos.y = game.height + pos.valignCollect;
        this.owner.move.set(0, game.height / -scrolltime);
    }
    update() {
        if (this.owner.pos.bottom <= 0) this.owner.remove();
    }
}
const text = {//テキスト
    done: '決定', cancel: '取消',
    title: 'シューティングゲーム', title2: 'のようなもの', presskey: 'Zキーを押してね',
    explanation1: '↑↓←→:選択、移動',
    explanation2: 'Z:決定、攻撃　X:取消、中断',
    title_copyright: '©2026 HAGURE YOUMA All rights reserved.',
    nextStage: 'Bキーで次へ',
    start: 'スタート', highscore: 'ハイスコア', credit: 'クレジット',
    pause: 'ポーズ', resume: 'ゲームを続ける', restart: '最初からやり直す', returntitle: 'タイトルに戻る',
    stageclear: 'ステージ　クリア', total: '合計', stage: 'ステージ', time: 'タイム', point: 'スコア', ko: '撃破数',
    gameover: 'ゲームオーバー', continue: 'コンティニュー',
    highscore_clear_key: 'Zキーでハイスコア消去',
    highscore_clear_confirm: 'ハイスコアを消去します。\nよろしいですか？',
    staff: [
        '制作　はぐれヨウマ',
        'プログラム　はぐれヨウマ',
        'グラフィック　はぐれヨウマ',
        'テストプレイ　はぐれヨウマ',
    ]
};
class CharacterData {//キャラデータ
    static type = { player: 'player', baddie: 'baddie', bomb: 'bomb' };
    constructor(type, name, char, color, size, hp, point, options = {}) {
        this.type = type;
        this.name = name;
        this.char = char;
        this.color = color;
        this.size = size;
        this.hp = hp;
        this.point = point;

        const { defeatEffect = undefined, isOutOfScreenToRemove = false, routine = '', forms = undefined, bomb = 0 } = options;
        this.defeatEffect = defeatEffect;
        this.isOutOfScreenToRemove = isOutOfScreenToRemove;
        this.routine = routine;
        this.forms = forms;
        this.bomb = bomb;
    }
}
const datas = {//ゲームデータ
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
        obake: new CharacterData(CharacterData.type.baddie, 'obake', EMOJI.GHOST, 'white', 40, 5, 200, { defeatEffect: 'star2', routine: 'zako4', forms: [Spawner.form.randomtop] }),
        crow: new CharacterData(CharacterData.type.baddie, 'crow', EMOJI.CROW, '#0B1730', 40, 5, 100, { defeatEffect: 'feather', routine: 'zako1', forms: [Spawner.form.v, Spawner.form.delta, Spawner.form.tri, Spawner.form.inverttri, Spawner.form.trail, Spawner.form.abrest, Spawner.form.randomtop] }),
        dove: new CharacterData(CharacterData.type.baddie, 'dove', EMOJI.DOVE, '#CBD8E1', 40, 5, 100, { defeatEffect: 'feather', routine: 'zako2', forms: [Spawner.form.left, Spawner.form.right, Spawner.form.randomside] }),
        bigcrow: new CharacterData(CharacterData.type.baddie, 'bigcrow', EMOJI.CROW, 'navy', 80, 20, 100, { defeatEffect: 'feather', routine: 'zako3', forms: [Spawner.form.topsingle] }),
        greatcrow: new CharacterData(CharacterData.type.baddie, 'greatcrow', EMOJI.CROW, '#0E252F', 120, 100, 2000, { defeatEffect: 'feather', routine: 'boss1', forms: [Spawner.form.topsingle] }),
        torimakicrow: new CharacterData(CharacterData.type.baddie, 'torimakicrow', EMOJI.CROW, '#0B1730', 40, 10, 200, { defeatEffect: 'feather', routine: 'boss1torimaki', forms: [Spawner.form.within] }),
    },
    player: {
        data: new CharacterData(CharacterData.type.player, 'player', EMOJI.CAT, 'black', 40, 2, 0, { defeatEffect: 'star2' }),
        moveSpeed: 300,
        bulletSpeed: 400,
        firelate: 1 / 20,
        damagedInvincibilityTime: 1,
    },
    items: {
        bomb: new CharacterData(CharacterData.type.bomb, 'bomb', EMOJI.BOMB, 'black', 20, 0, 1000, { defeatEffect: 'star2', routine: 'item1', bomb: 1 }),
    },
    game: {
        highscoreListMax: 10,
        extendedScore: 50000,
        defaultRemains: 2,
        defaultBombs: 1
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
        game.save(data, key)
    }
    load(key) {
        const data = game.load(key);
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
game.start(() => {
    //キー割り当て
    game.input.keybind('z', 'z', { button: 1 });
    game.input.keybind('x', 'x', { button: 0 });
    game.input.keybind('c', 'c', { button: 2 });
    //背景
    const ctx = game.layers.get('bg').getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, game.height);
    grad.addColorStop(0, "#2B4C99");
    grad.addColorStop(1, "#AFC8E4");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, game.width, game.height);
    //レイヤー
    game.layers.add('be', 'main');
    game.layers.add(['effect', 'ui']);
    game.layers.get('effect').enableBlur();
    //セーブデータのロード
    shared.load(game.cfg.saveData.name);
    //タイトルシーンの表示
    game.pushScene(new SceneTitle());
});