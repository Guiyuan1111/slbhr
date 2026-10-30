/**
 * box2d 内核 —— 角色类（火/水共用，原版 States/Level/character 逐行转写，源码存 note/evidence/init-js-regions/char-region.js）。
 *
 * 复合碰撞体（body 原点=贴图中心，fixedRotation，bullet）：
 *   - 躯干圆 r1@(0,y1) friction 0、脚底圆 r2@(0,y2) friction 0.5（feetSensor）
 *   - 躯干梯形（唯一质量源）：(±(r1−dr), y1)、(±(r2−dr), y2)，density 1.4、friction 0
 *   - portal 感应圆 0.1（森林无传送门，保留几何）
 * 手感（update 逐行）：力驱动 + currentRunForce 爬升 + 边沿触发跳跃 + 液体致死经 feet 感应。
 * 冰面分支（森林无冰）保留控制流但恒走非冰路径。
 *
 * 【转写纪律】任何与源码不一致的"优化"都是保真 bug——本文件不做任何数值假设。
 */
import type { Role } from "../types.js";
import { CHAR } from "../params.js";
import type { B2 } from "./b2.js";
import { FILTER, circleFixture, polygonFixture, px2m } from "./b2.js";

// CHAR 常数（@1863650–1863990）唯一来源 = ../params.ts（#44 双源合一：原 13 键本地副本
// 与 params 同名值逐一相等，删除副本改为 import，改参不再需要多处同步）。
export { CHAR };

export type AnimState = "idle" | "jumping" | "rising" | "falling";

export interface InputState {
  up: boolean;
  left: boolean;
  right: boolean;
}

export class Character {
  readonly role: Role;
  readonly char: "fb" | "wg";
  readonly body: any;
  readonly feetSensor: any;

  /** 原版可变状态 */
  currentRunForce: number | undefined = undefined;
  prohibitJump = false;
  isOnLiquid = false;
  dying = false;
  dead = false;
  isDead = false;
  /** 死亡烟雾进度（原版 45 帧 @30fps = 1.5s） */
  smokeT = 0;
  /** 钻石计数（data.diamonds / data.silverDiamond） */
  diamonds = 0;
  silverDiamond = 0;

  /** 雪面/冻面接触计数与冰面态（原版 snowCount/isOnIce @57136/63106，#35 接线） */
  snowCount = 0;
  isOnIce = false;
  /** 运行时限速（setFriction 随冰面态切换；wg 冰面 waterIceMaxSpeed） */
  maxSpeed: number = CHAR.defaultMaxSpeed;

  /** 脚底接触表（b2Contact[]，begin/end 由世界接触监听维护） */
  readonly feetContacts: any[] = [];

  /** 输出（供快照/客户端）：动画与朝向 */
  anim: AnimState = "idle";
  /** 头部贴图水平翻转：−1=朝左，1=朝右 */
  facing: 1 | -1 = 1;
  headTilt = 0;

  private jumpedThisFrame = false;

  /** 本角色跳跃初速（部别 vintage：F=16.5、A–E=15.5；World 按 level.id 注入） */
  private readonly jumpV: number;

  constructor(B: B2, world: any, role: Role, spawn: { x: number; y: number }, jumpVelocity?: number) {
    this.jumpV = jumpVelocity ?? CHAR.jumpVelocity;
    this.role = role;
    this.char = role === "fireboy" ? "fb" : "wg";
    // 原版：d += mpx(1), f -= mpx(1)（自 RAW 图块对象 (o.x, o.y底边)）。
    // level2 spawn 已是 (o.x+32, o.y)——只剩 y−32；金轨迹实证：fb 体中心 = (96, 864)screen = (−3, −27)phys
    const bd = new B.b2BodyDef();
    bd.type = B.b2BodyType.b2_dynamicBody;
    bd.position = new B.b2Vec2(px2m(spawn.x), px2m(spawn.y - 32));
    bd.fixedRotation = true;
    const body = world.CreateBody(bd);
    body.SetUserData("pers");
    body.SetBullet(true);
    this.body = body;

    // fixture 创建顺序对齐原版 createShapes（bundle 42897-42911）：portal → 躯干圆 → 脚底圆 → 躯干梯形。
    // box2d 求解器按 fixture 顺序遍历接触，落地冲量分配依赖该顺序（forest_04 滑轮板漂移亚像素敏感，
    // 2026-10-06 二轮校准：前版「portal→头→梯形→脚」顺序系误读，原版脚圆在梯形之前 42910 行）。
    // portal 感应圆 0.1（cat 4096 / mask 4096 / groupIndex −1）
    circleFixture(body, B, 0.1, { x: 0, y: 0 }, {
      categoryBits: FILTER.PORTAL_CAT,
      maskBits: FILTER.PORTAL_MASK,
      groupIndex: -1,
      friction: 0,
      density: 0,
      userData: { "portal-sensor": true },
    });
    // 躯干圆（friction 0）
    circleFixture(body, B, CHAR.r1, { x: 0, y: CHAR.y1 }, {
      categoryBits: FILTER.CHAR_CAT,
      maskBits: FILTER.CHAR_MASK,
      friction: 0,
      density: 0,
    });
    // 脚底圆（feetSensor，friction 0.5；原版 filter cat16/mask4353 经 m 助手统一设置，42860-42861 + 42910）
    this.feetSensor = circleFixture(body, B, CHAR.r2, { x: 0, y: CHAR.y2 }, {
      categoryBits: FILTER.CHAR_CAT,
      maskBits: FILTER.CHAR_MASK,
      friction: CHAR.feetFriction,
      density: 0,
      userData: "feet",
    });
    // 躯干梯形（唯一质量源：density 1.4，friction 0）——原版在脚圆之后创建
    const dr = CHAR.dr;
    polygonFixture(body, B, [
      { x: CHAR.r1 - dr, y: CHAR.y1 },
      { x: -CHAR.r1 + dr, y: CHAR.y1 },
      { x: CHAR.r2 - dr, y: CHAR.y2 },
      { x: -CHAR.r2 + dr, y: CHAR.y2 },
    ], {
      categoryBits: FILTER.CHAR_CAT,
      maskBits: FILTER.CHAR_MASK,
      friction: 0,
      density: 1.4,
    });
  }

  /** 脚底接触增删（由 World 的接触监听调用；原版 setFixtureContactCallback 语义） */
  feetContactBegin(contact: any): void {
    // 原版要求 manifold 法线非零才入列
    const manifold = contact.GetManifold ? contact.GetManifold() : contact.m_manifold;
    if (manifold && manifold.localNormal && manifold.localNormal.Length() > 0) {
      this.feetContacts.push(contact);
    }
  }

  feetContactEnd(contact: any): void {
    const i = this.feetContacts.indexOf(contact);
    if (i >= 0) this.feetContacts.splice(i, 1);
  }

  /** 雪面/冻面接触增删（原版 iceFixture 回调语义：snowCount±1 → setOnIce(snowCount!==0)） */
  snowBegin(): void {
    this.snowCount++;
    this.setOnIce(this.snowCount !== 0);
  }

  snowEnd(): void {
    this.snowCount--;
    this.setOnIce(this.snowCount !== 0);
  }

  /** 原版 setOnIce @63106：边沿翻转才重设摩擦 */
  private setOnIce(a: boolean): void {
    if (a && !this.isOnIce) {
      this.isOnIce = true;
      this.setFriction();
    } else if (!a && this.isOnIce) {
      this.isOnIce = false;
      this.setFriction();
    }
  }

  /** 原版 setFriction @63116：fb 冰面摩擦 0；wg 冰面摩擦 0.7 且限速 waterIceMaxSpeed；
   *  非冰回 feetFriction/defaultMaxSpeed。尾部 Refilter 并对既有接触 ResetFriction（即时生效）。 */
  private setFriction(): void {
    if (this.char === "fb") {
      this.feetSensor.SetFriction(this.isOnIce ? 0 : CHAR.feetFriction);
      this.maxSpeed = CHAR.defaultMaxSpeed;
    } else {
      this.feetSensor.SetFriction(this.isOnIce ? 0.7 : CHAR.feetFriction);
      this.maxSpeed = this.isOnIce ? CHAR.waterIceMaxSpeed : CHAR.defaultMaxSpeed;
    }
    this.feetSensor.Refilter();
    let cl = this.feetSensor.GetBody().GetContactList();
    while (cl) {
      cl.contact.ResetFriction();
      cl = cl.next;
    }
  }

  /** 液体致死判定（原版 liquidTouched：7 全杀 / wg 遇 6 / fb 遇 5） */
  liquidTouched(liquidType: number): boolean {
    return liquidType === 7 || (this.char === "wg" && liquidType === 6) || (this.char === "fb" && liquidType === 5);
  }

  kill(): void {
    if (!this.dying) {
      this.dying = true;
      this.dead = true; // 原版 _doKill 立即置 dead
      this.smokeT = 0;
    }
  }

  /** 帧更新（原版 update @1870200–1873400 逐行；dt 秒）。死亡时不施力。 */
  update(B: B2, dt: number, cursors: InputState, onJumpSound: (role: Role) => void): void {
    if (this.dying) {
      // 原版：dying 时只播烟雾，dead 后每帧清零速度
      if (this.dead) this.body.SetLinearVelocity(new B.b2Vec2(0, 0));
      this.smokeT += dt;
      if (!this.isDead && this.smokeT >= 45 / 30) {
        this.isDead = true; // 原版烟雾 onComplete 后 isDead → checkEndGame gameOver
      }
      return;
    }

    const k = CHAR.jumpImpulse;
    const jumpVelocity = this.jumpV;
    const s = CHAR.runForce;
    const h = CHAR.floatForce;
    const m = this.maxSpeed;

    // 脚底接触法线：世界系，按与 (0,−1) 点积升序取最上者
    let n: { x: number; y: number } | undefined;
    const down = { x: 0, y: -1 };
    if (this.feetContacts.length > 0) {
      for (const c of this.feetContacts) {
        if (!c.m_normal) c.m_normal = new B.b2Vec2();
        const manifold = c.GetManifold ? c.GetManifold() : c.m_manifold;
        c.m_fixtureA.m_body.GetWorldVector(manifold.localNormal, c.m_normal);
      }
      const sorted = [...this.feetContacts].sort((a, b) => a.m_normal.Dot(down) - b.m_normal.Dot(down));
      n = sorted[0].m_normal;
    }

    // 力爬升增量：e = 130·dt / currentRunForce；慢速且已过半程则整帧给满
    let e = (130 * dt) / this.currentRunForce!;
    const vel = this.body.GetLinearVelocity();
    if (vel.Length() < 1 && this.currentRunForce! > 0.5 * s) e = s;

    let i: { x: number; y: number } | undefined;
    if (cursors.left) {
      if (n) {
        if (this.currentRunForce! < s) this.currentRunForce = Math.min(this.currentRunForce! + e, s);
        const p = n.y > 0.6 ? n.y : 0;
        // n × (−F)：SelfCrossSV(a) ⇒ (x,y) ← (−a·y, a·x)
        i = { x: -(-this.currentRunForce!) * n.y, y: -this.currentRunForce! * n.x };
        const f = Math.max(0, Math.sqrt(p));
        i = { x: i.x * f, y: i.y * f };
        if (p > 0.6 && i.y >= 0 && i.y < 20) i.y += 20;
      } else {
        i = { x: h, y: 0 };
      }
    } else if (cursors.right) {
      if (n) {
        if (this.currentRunForce! < s) this.currentRunForce = Math.min(this.currentRunForce! + e, s);
        const p = n.y > 0.6 ? n.y : 0;
        i = { x: -this.currentRunForce! * n.y, y: this.currentRunForce! * n.x };
        const f = Math.max(0, Math.sqrt(p));
        i = { x: i.x * f, y: i.y * f };
        if (p > 0.6 && i.y >= 0 && i.y < 20) i.y += 20;
      } else {
        i = { x: -h, y: 0 };
      }
    } else {
      this.currentRunForce = 0.475 * s;
      // 无输入减速（原版 @63254-63264）：wg 在冰面硬停（反速度×20 + 速度清零），其余 i = (7·−vx, 0)
      const vx = this.body.GetLinearVelocity().x;
      if (this.isOnIce && this.char === "wg") {
        i = { x: -vx * 20, y: 0 };
        this.body.SetLinearVelocity(new B.b2Vec2(0, 0));
      } else {
        i = { x: 7 * -vx, y: 0 };
      }
    }

    // 跳跃：prohibitJump 边沿 + 法线门控
    if (this.prohibitJump && !cursors.up) this.prohibitJump = false;
    if (!this.prohibitJump && cursors.up && ((n !== undefined && n.y > 0.2) || this.feetContacts.length >= 2)) {
      this.body.ApplyLinearImpulse({ x: 0, y: k }, { x: 0, y: 0 });
      // 起跳只走非冰分支（oracle jumpIceVelocity @63028 同样定义未消费）
      let v = { x: this.body.GetLinearVelocity().x, y: n!.y > 0.65 ? jumpVelocity : Math.sqrt(Math.sqrt(n!.y)) * jumpVelocity };
      const len = Math.hypot(v.x, v.y);
      if (len > jumpVelocity) {
        v = { x: (v.x / len) * jumpVelocity, y: (v.y / len) * jumpVelocity };
      }
      this.body.SetLinearVelocity(new B.b2Vec2(v.x, v.y));
      this.jumpedThisFrame = true;
      // 对脚下 reactable（摆/平台）施 −1 冲量
      let q = this.body.GetContactList();
      while (q) {
        const other = q.contact.m_fixtureA.m_body;
        if (other.GetUserData() === "reactable") {
          other.ApplyLinearImpulse(new B.b2Vec2(0, -1), new B.b2Vec2(0, 0), true);
        }
        q = q.next;
      }
      this.prohibitJump = true;
      onJumpSound(this.role);
    }

    // 施力：跳跃帧强制 i.y=0；x 分量速度未超 maxSpeed 才 ApplyForce
    if (i !== undefined) {
      if (this.jumpedThisFrame) {
        i = { x: i.x, y: 0 };
        this.jumpedThisFrame = false;
      }
      const u = this.body.GetLinearVelocity();
      if (i.x > 0 && u.x < m) this.body.ApplyForce(new B.b2Vec2(i.x, i.y), new B.b2Vec2(0, 0));
      if (i.x < 0 && u.x > -m) this.body.ApplyForce(new B.b2Vec2(i.x, i.y), new B.b2Vec2(0, 0));
    }
    // 硬钳 absoluteMaxSpeed（无条件）
    const u2 = this.body.GetLinearVelocity();
    if (u2.Length() > CHAR.absoluteMaxSpeed) {
      u2.SelfNormalize().SelfMul(CHAR.absoluteMaxSpeed);
      this.body.SetLinearVelocity(u2);
    }

    this.updateAnim(cursors, n);
  }

  /** 动画状态机（原版 update 后半段：idle/jumping/rising/falling + 头部倾角） */
  private updateAnim(cursors: InputState, n: { x: number; y: number } | undefined): void {
    const u = this.body.GetLinearVelocity();
    const o = { x: u.x, y: u.y };
    const len = Math.hypot(o.x, o.y);
    if (len > 1e-5) {
      o.x /= len;
      o.y /= len;
    }
    let a = Math.atan2(Math.max(-0.333, o.y), o.x);
    let anim: AnimState;
    let facing: 1 | -1;
    if (n) {
      if (cursors.left) {
        anim = "jumping";
        facing = -1;
        a = Math.atan2(n.y, n.x) - Math.PI / 2;
        a = Math.max(Math.min(a, 0.25 * Math.PI), -0.1 * Math.PI);
      } else if (cursors.right) {
        anim = "jumping";
        facing = 1;
        a = Math.atan2(n.y, n.x) - Math.PI / 2;
        a = Math.max(Math.min(a, 0.1 * Math.PI), -0.25 * Math.PI);
      } else {
        anim = "idle";
        facing = 1;
        a = 0;
      }
    } else if (u.x > 4) {
      anim = "jumping";
      facing = -1;
    } else if (u.x < -4) {
      anim = "jumping";
      facing = 1;
      a += Math.PI;
    } else if (u.y > 3) {
      anim = "rising";
      facing = 1;
      a = 0;
    } else if (u.y < -3) {
      anim = "falling";
      facing = 1;
      a = 0;
    } else if (cursors.left) {
      anim = "jumping";
      facing = -1;
      a = this.headTilt;
    } else if (cursors.right) {
      anim = "jumping";
      facing = 1;
      a = this.headTilt;
    } else {
      anim = "idle";
      facing = 1;
      a = 0;
    }
    this.anim = anim;
    this.facing = facing;
    this.headTilt = a;
  }
}
