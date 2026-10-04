erty;
		define("States/Level/character", ["./CharCursors", "Phaser"], function (c) {
			"use strict";
			var d;
			return (d = d = (function (d) {
				function e(b, d, f, g) {
					(this.drawDarkMask = a(this.drawDarkMask, this)),
						(this.update = a(this.update, this)),
						(this.setFriction = a(this.setFriction, this)),
						(this.setOnIce = a(this.setOnIce, this)),
						(this.animateStairs = a(this.animateStairs, this)),
						(this.destroy = a(this.destroy, this)),
						(this._doKill = a(this._doKill, this)),
						(this.kill = a(this.kill, this)),
						(this.liquidTouched = a(this.liquidTouched, this));
					var h, i, j, k, l, m, n, o, p, q, r, s;
					return (
						(this.maxSpeed = this.defaultMaxSpeed),
						e.__super__.constructor.call(this, b),
						(d += this.game.physics.box2d.mpx(1)),
						(f -= this.game.physics.box2d.mpx(1)),
						(this.data = { char: g, diamonds: 0, silverDiamond: 0 }),
						(this.sprite = this.game.make.sprite(d, f, "CharAssets", "_default0000")),
						(this.sprite.character = this),
						(this.sprite.scale.x = this.spriteScale),
						(this.sprite.scale.y = this.spriteScale),
						this.game.layers.chars.addChild(this.sprite),
						this.game.physics.box2d.enable(this.sprite),
						(this.body = this.sprite.body),
						this.body.clearFixtures(),
						(this.body.fixedRotation = !0),
						(this.body.data.m_userData = "pers"),
						this.body.data.SetBullet(!0),
						(this.signal = new Phaser.Signal()),
						(m = (function (a) {
							return function (b, c, d) {
								var e, f, g;
								return (
									(e = new box2d.b2CircleShape(b)),
									e.m_p.SetXY(c[0], c[1]),
									(g = new box2d.b2FixtureDef()),
									(g.shape = e),
									(g.density = 0),
									(g.filter.categoryBits = 16),
									(g.filter.maskBits = 4353),
									(g.friction = d),
									(f = a.body.data.CreateFixture(g)),
									(f.id = a.body.world.getNextFixtureId()),
									f
								);
							};
						})(this)),
						(n = (function (a) {
							return function (b, c, d, e) {
								var f, g, h, i, j;
								return (
									(j = []),
									(f = a.dr),
									j.push(new box2d.b2Vec2(b - f, d)),
									j.push(new box2d.b2Vec2(-b + f, d)),
									j.push(new box2d.b2Vec2(c - f, e)),
									j.push(new box2d.b2Vec2(-c + f, e)),
									(i = new box2d.b2PolygonShape()),
									i.Set(j),
									(h = new box2d.b2FixtureDef()),
									(h.shape = i),
									(h.friction = 0),
									(h.density = 1.4),
									(h.filter.categoryBits = 16),
									(h.filter.maskBits = 4353),
									(g = a.body.data.CreateFixture(h)),
									(g.id = a.body.world.getNextFixtureId()),
									g
								);
							};
						})(this)),
						(p = this.r1),
						(q = this.r2),
						(r = this.y1),
						(s = this.y2),
						(h = new box2d.b2CircleShape(0.1)),
						h.m_p.SetXY(0, 0),
						(i = new box2d.b2FixtureDef()),
						(i.shape = h),
						(i.density = 0),
						(i.filter.categoryBits = 4096),
						(i.filter.maskBits = 4096),
						(i.filter.groupIndex = -1),
						(i.friction = 0),
						(this.portalSensor = this.body.data.CreateFixture(i)),
						(this.portalSensor.id = this.body.world.getNextFixtureId()),
						(this.portalSensor.m_userData = { "portal-sensor": !0 }),
						m(p, [0, r], 0),
						(this.feetSensor = m(q, [0, s], this.feetFriction)),
						n(p, q, r, s),
						(this.feetSensor.m_userData = "feet"),
						(this.feetSensor.contacts = []),
						(o = "fb" === g ? "fire" : "water"),
						(this.prefix = o),
						(this.bodySprite = b.make.sprite(0, 0, "CharAssets", "_default0000")),
						this.sprite.addChild(this.bodySprite),
						(l = b.make.sprite(0, 0, "CharAssets")),
						l.anchor.set(0.5),
						l.animations.add("running", Phaser.Animation.generateFrameNames(o + "_legs_running", 0, 7, "", 4), 30, !0),
						"wg" === this.data.char && l.animations.add("onice", Phaser.Animation.generateFrameNames(o + "_legs_running", 0, 7, "", 4), 10, !0),
						(l.frameName = o + "_legs_idle0000"),
						this.bodySprite.addChild(l),
						(j = b.make.sprite(0, 0, "CharAssets")),
						j.animations.add("idle", Phaser.Animation.generateFrameNames(o + "_head_idle", 0, 29, "", 4), 30, !0),
						j.animations.add("falling", Phaser.Animation.generateFrameNames(o + "_head_falling", 0, 4, "", 4), 30, !0),
						j.animations.add("jumping", Phaser.Animation.generateFrameNames(o + "_head_jumping", 0, 10, "", 4), 30, !0),
						j.animations.add("rising", Phaser.Animation.generateFrameNames(o + "_head_rising", 0, 4, "", 4), 30, !0),
						j.anchor.set(0.5),
						j.animations.play("idle"),
						this.bodySprite.addChild(j),
						(k = b.make.sprite(0, 0, "CharAssets")),
						k.anchor.set(0.5),
						k.animations.add("loop", Phaser.Animation.generateFrameNames(o + "_ice_legs", 0, 4, "", 4), 10, !0),
						(k.visible = !1),
						this.bodySprite.addChild(k),
						(this.bodyParts = {}),
						(this.bodyParts.legs = l),
						(this.bodyParts.ice = k),
						(this.bodyParts.head = j),
						(this.bodySprite.hitArea = new PIXI.Circle(0, 0, 0.65 * l.height)),
						this.body.setFixtureContactCallback(
							this.feetSensor,
							(function (a) {
								return function (b, c, d, e, f, g) {
									var h;
									if (e.m_isSensor) {
										if (null != e.m_userData && "liquid_death" === e.m_userData.type) return f ? (a.liquidTouched(e.m_userData.liquidType), (a.isOnLiquid = !0)) : (a.isOnLiquid = !1);
									} else {
										if (f && g.m_manifold.localNormal.Length() > 0) return a.feetSensor.contacts.push(g);
										if ((h = a.feetSensor.contacts.indexOf(g)) >= 0) return a.feetSensor.contacts.splice(h, 1);
									}
								};
							})(this),
							this
						),
						(this.cursors = new c(this.game, g)),
						(this.sprite.char = this.char = g),
						this
					);
				}
				return (
					b(e, d),
					(e.prototype.facing = "left"),
					(e.prototype.feetFriction = 0.5),
					(e.prototype.r1 = 0.48),
					(e.prototype.r2 = 0.2),
					(e.prototype.dr = 0.03),
					(e.prototype.y1 = 0.2),
					(e.prototype.y2 = -0.9),
					(e.prototype.spriteScale = 0.95),
					(e.prototype.jumpImpulse = 1),
					(e.prototype.jumpVelocity = 15.5),
					(e.prototype.jumpIceVelocity = 10),
					(e.prototype.runForce = 50),
					(e.prototype.floatForce = 30),
					(e.prototype.defaultMaxSpeed = 8.5),
					(e.prototype.waterIceMaxSpeed = 2),
					(e.prototype.absoluteMaxSpeed = 40),
					(e.prototype.liquidTouched = function (a) {
						if(! (7 === a || ("wg" === this.char && 6 === a) || ("fb" === this.char && 5 === a)) ) {
							return;
						}
						if(GameConfig.cheating.isInvulnerable) {
							if (!this.dying) {
								var a, b;
								this.game.level.sounds.death.play();
								(b = this.game.make.sprite(0, -0.7 * this.game.physics.box2d.mpx(1), "CharAssets")),
								(a = b.animations.add("play", Phaser.Animation.generateFrameNames("death_smoke", 0, 45, "", 4), 30, !1)),
								this.body.data.GetLinearVelocity().x < 0 && (b.scale.x = -1),
								b.animations.play("play"),
								b.anchor.set(0.5),
								a.killOnComplete=true,
								this.sprite.addChild(b);
							}
							return;
						}
						return this.kill();
					}),
					(e.prototype.kill = function () {
						if (!this.dying) return (this.dying = !0), _.delay(this._doKill, 0);
					}),
					(e.prototype._doKill = function () {
						var a, b;
						return (
							this.game.level.sounds.death.play(),
							this.game.level.sounds.levelMusic.stop(),
							this.game.level.sounds.levelMusicOver.play(),
							(b = this.game.make.sprite(0, -0.7 * this.game.physics.box2d.mpx(1), "CharAssets")),
							(a = b.animations.add("play", Phaser.Animation.generateFrameNames("death_smoke", 0, 45, "", 4), 30, !1)),
							this.body.data.GetLinearVelocity().x < 0 && (b.scale.x = -1),
							b.animations.play("play"),
							b.anchor.set(0.5),
							a.onComplete.add(
								(function (a) {
									return function () {
										return (a.sprite.visible = !1), (a.isDead = !0), a.signal.dispatch();
									};
								})(this)
							),
							this.sprite.addChild(b),
							(this.dead = !0)
						);
					}),
					(e.prototype.destroy = function () {
						return e.__super__.destroy.apply(this, arguments), this.cursors.destroy();
					}),
					(e.prototype.animateStairs = function (a) {
						var b;
						return (
							(this.bodyParts.head.visible = !1),
							(this.bodyParts.legs.visible = !1),
							(b = this.game.make.sprite(0, 0, "CharAssets")),
							b.animations.add("up", Phaser.Animation.generateFrameNames(this.prefix + "_stairs", 0, 30, "", 4), 25, !1),
							b.anchor.set(0.5, 1),
							this.game.add.tween(b.scale).to({ x: 0.8, y: 0.8 }, 360, Phaser.Easing.Linear.None, !0, 0),
							this.sprite.addChild(b),
							(this.body.x = a.pos.x),
							(this.body.y = a.pos.y + 4),
							b.animations.play("up")
						);
					}),
					(e.prototype.setOnIce = function (a) {
						return a && !this.isOnIce ? ((this.isOnIce = !0), this.setFriction()) : !a && this.isOnIce ? ((this.isOnIce = !1), this.setFriction()) : void 0;
					}),
					(e.prototype.setFriction = function () {
						var a, b;
						for (
							"fb" === this.data.char && (this.isOnIce ? ((this.feetSensor.m_friction = 0), (this.maxSpeed = this.defaultMaxSpeed)) : ((this.feetSensor.m_friction = this.feetFriction), (this.maxSpeed = this.defaultMaxSpeed))),
								"wg" === this.data.char &&
									(this.isOnIce ? ((this.feetSensor.m_friction = 0.7), (this.maxSpeed = this.waterIceMaxSpeed)) : ((this.feetSensor.m_friction = this.feetFriction), (this.maxSpeed = this.defaultMaxSpeed))),
								this.feetSensor.Refilter(),
								a = this.feetSensor.m_body.m_contactList,
								b = [];
							null != a;

						)
							a.contact.ResetFriction(), b.push((a = a.next));
						return b;
					}),
					(e.prototype.update = function () {
						var a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w;
						if (!((null != this.game.level && this.game.level.ended) || this.game.physics.box2d.paused)) {
							if (this.dying) return (this.bodySprite.visible = !1), (this.bodyParts.legs.visible = !1), (this.bodyParts.head.visible = !1), void (this.dead && this.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0)));
							if (
								((k = this.jumpImpulse),
								(l = this.jumpVelocity),
								(s = this.runForce),
								(h = this.floatForce),
								(m = this.defaultMaxSpeed),
								(this.cursors.right.isDown || this.cursors.left.isDown) && this.isOnLiquid
									? this.waterplaying || ((this.waterplaying = !0), (this.game.level.sounds.waterSteps.loop = !0), (this.game.level.sounds.waterSteps.volume = 0.5), this.game.level.sounds.waterSteps.play())
									: this.waterplaying === !0 && ((this.waterplaying = !1), this.game.level.sounds.waterSteps.stop()),
								(this.cursors.right.isDown || this.cursors.left.isDown) && this.isOnIce
									? this.iceplaying || ((this.iceplaying = !0), (this.game.level.sounds["iceSteps_" + this.data.char].loop = !0), this.game.level.sounds["iceSteps_" + this.data.char].play())
									: this.iceplaying === !0 && ((this.iceplaying = !1), this.game.level.sounds["iceSteps_" + this.data.char].stop()),
								(j = new box2d.b2Vec2(0, -1)),
								this.feetSensor.contacts.length > 0 &&
									(_.each(
										this.feetSensor.contacts,
										(function (a) {
											return function (a) {
												return a.m_normal || (a.m_normal = new box2d.b2Vec2()), a.m_fixtureA.m_body.GetWorldVector(a.m_manifold.localNormal, a.m_normal);
											};
										})(this)
									),
									(this.feetSensor.contacts = _.sortBy(
										this.feetSensor.contacts,
										(function (a) {
											return function (a) {
												return a.m_normal.Dot(j);
											};
										})(this)
									)),
									(d = this.feetSensor.contacts[0]),
									(n = d.m_normal)),
								(g = this.game.time.elapsed / 1e3),
								(e = (130 * g) / this.currentRunForce),
								this.body.data.GetLinearVelocity().Length() < 1 && this.currentRunForce > 0.5 * s && (e = s),
								this.cursors.left.isDown
									? null != d
										? (this.currentRunForce < s && (this.currentRunForce = Math.min(this.currentRunForce + e, s)),
										  (p = n.y > 0.6 ? n.y : 0),
										  (i = n
											  .Clone()
											  .SelfCrossSV(-this.currentRunForce)
											  .SelfMul(Math.max(0, Math.sqrt(p)))),
										  p > 0.6 && i.y >= 0 && i.y < 20 && (i.y += 20))
										: (i = new box2d.b2Vec2(h, 0))
									: this.cursors.right.isDown
									? null != d
										? (this.currentRunForce < s && (this.currentRunForce = Math.min(this.currentRunForce + e, s)),
										  (p = n.y > 0.6 ? n.y : 0),
										  (i = n
											  .Clone()
											  .SelfCrossSV(this.currentRunForce)
											  .SelfMul(Math.max(0, Math.sqrt(p)))),
										  p > 0.6 && i.y >= 0 && i.y < 20 && (i.y += 20))
										: (i = new box2d.b2Vec2(-h, 0))
									: ((this.currentRunForce = 0.475 * s),
									  this.isOnIce && "wg" === this.data.char
										  ? ((i = new box2d.b2Vec2(20 * -this.body.data.GetLinearVelocity().x, 0)), this.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0)))
										  : (i = new box2d.b2Vec2(7 * -this.body.data.GetLinearVelocity().x, 0))),
								this.prohibitJump && !this.cursors.up.isDown && (this.prohibitJump = !1),
								!this.prohibitJump && this.cursors.up.isDown && ((null != n && n.y > 0.2) || this.feetSensor.contacts.length >= 2))
							) {
								for (
									this.body.data.ApplyLinearImpulse({ x: 0, y: k }, { x: 0, y: 0 }),
										this.isOnIce
											? "fb" === this.data.char
												? n.y > 0.9
													? ((v = new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, 3 * n.y)), this.body.data.SetLinearVelocity(v))
													: ((v = new box2d.b2Vec2(3 * n.x, 3 * n.y)), this.body.data.SetLinearVelocity(v))
												: ((v = new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, this.jumpIceVelocity)), this.body.data.SetLinearVelocity(v))
											: ((v =
												  n.y > 0.65
													  ? new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, this.jumpVelocity)
													  : new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, Math.sqrt(Math.sqrt(n.y)) * this.jumpVelocity)),
											  v.Length() > this.jumpVelocity && v.SelfNormalize().SelfMul(this.jumpVelocity),
											  this.body.data.SetLinearVelocity(v),
											  (f = !0)),
										q = this.feetSensor.m_body.m_contactList,
										r = new box2d.b2Vec2(0, -1),
										w = r;
									null != q;

								)
									(c = q.contact.m_fixtureA.m_body), "reactable" === c.m_userData && c.ApplyLinearImpulse(r, { x: 0, y: 0 }, !0), (q = q.next);
								(this.prohibitJump = !0), "wg" === this.char ? this.game.level.sounds.jump_wg.play() : this.game.level.sounds.jump_fb.play();
							}
							null != i &&
								(f && ((i.y = 0), (f = !1)),
								this.isOnIce &&
									("fb" === this.data.char && i.SelfMul(0.2),
									"wg" === this.data.char && i.SelfMul(1),
									(u = this.body.data.GetLinearVelocity()),
									u.Length() > this.maxSpeed && (u.SelfNormalize().SelfMul(this.maxSpeed), this.body.data.SetLinearVelocity(u))),
								(u = this.body.data.GetLinearVelocity()),
								i.x > 0 && u.x < this.maxSpeed && this.body.data.ApplyForce(i, { x: 0, y: 0 }),
								i.x < 0 && u.x > -this.maxSpeed && this.body.data.ApplyForce(i, { x: 0, y: 0 })),
								u.Length() > this.absoluteMaxSpeed && (u.SelfNormalize().SelfMul(this.absoluteMaxSpeed), this.body.data.SetLinearVelocity(u)),
								(u = this.body.data.GetLinearVelocity()),
								(o = u.Clone().SelfNormalize()),
								(a = Math.atan2(Math.max(-0.333, o.y), o.x)),
								null != n
									? this.cursors.left.isDown
										? ((b = "jumping"), (t = -1), (a = Math.atan2(n.y, n.x) - Math.PI / 2), (a = Math.max(Math.min(a, 0.25 * Math.PI), 0.1 * -Math.PI)))
										: this.cursors.right.isDown
										? ((b = "jumping"), (t = 1), (a = Math.atan2(n.y, n.x) - Math.PI / 2), (a = Math.max(Math.min(a, 0.1 * Math.PI), 0.25 * -Math.PI)))
										: ((b = "idle"), (t = 1), (a = 0))
									: u.x > 4
									? ((b = "jumping"), (t = -1), (a = a))
									: u.x < -4
									? ((b = "jumping"), (t = 1), (a += Math.PI))
									: u.y > 3
									? ((b = "rising"), (t = 1), (a = 0))
									: u.y < -3
									? ((b = "falling"), (t = 1), (a = 0))
									: this.cursors.left.isDown
									? ((b = "jumping"), (t = -1), (a = this.bodyParts.head.rotation))
									: this.cursors.right.isDown
									? ((b = "jumping"), (t = 1), (a = this.bodyParts.head.rotation))
									: ((b = "idle"), (t = 1), (a = 0)),
								this.bodyParts.head.scale.set(t, 1),
								(this.bodyParts.head.rotation = a),
								this.bodyParts.head.animations.play(b),
								"rising" === b
									? this.bodyParts.legs.renderOrderID < this.bodyParts.head.renderOrderID && (this.sprite.removeChild(this.bodyParts.legs, !1, !0), this.sprite.addChild(this.bodyParts.legs, !0))
									: this.bodyParts.legs.renderOrderID > this.bodyParts.head.renderOrderID && (this.sprite.removeChild(this.bodyParts.head, !1, !0), this.sprite.addChild(this.bodyParts.head, !0)),
								"jumping" === b
									? (t === -1 && "left" !== this.facing && (this.bodyParts.legs.scale.set(-1, 1), this.bodyParts.ice.scale.set(-1, 1), (this.facing = "left")),
									  1 === t && "right" !== this.facing && (this.bodyParts.legs.scale.set(1, 1), this.bodyParts.ice.scale.set(1, 1), (this.facing = "right")),
									  this.isOnIce ? (this.bodyParts.ice.animations.play("loop"), (this.bodyParts.ice.visible = !0)) : (this.bodyParts.ice.animations.stop(), (this.bodyParts.ice.visible = !1)),
									  "wg" === this.data.char && this.isOnIce ? this.bodyParts.legs.animations.play("onice") : this.bodyParts.legs.animations.play("running"))
									: "idle" !== this.facing &&
									  (this.bodyParts.ice.animations.stop(),
									  (this.bodyParts.ice.visible = !1),
									  this.bodyParts.legs.animations.stop(),
									  (this.bodyParts.legs.frameName = this.prefix + "_legs_idle0000"),
									  (this.facing = "idle"));
						}
					}),
					(e.prototype.drawDarkMask = function (a) {
						var b, c;
						return (
							(a.ctx.globalCompositeOperation = "lighter"),
							(c = { x: this.sprite.x + a.offset.x, y: this.sprite.y + a.offset.y }),
							(b = a.ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 180)),
							b.addColorStop(0, "rgba(255,255,255,1)"),
							b.addColorStop(0.5, "rgba(255,255,255,0.3)"),
							b.addColorStop(1, "transparent"),
							a.circle(c.x, c.y, 220, b)
						);
					}),
					e
				);
			})(Phaser.Group));
		});
	}.call(this),
	function () {
		var a = function (a, b) {
				return function () {
					return a.apply(b, arguments);
				};
			},
			b = function (a, b) {
				function d() {
					this.constructor = a;
				}
				for (var e in b) c.call(b, e) && (a[e] = b[e]);
				return (d.prototype = b.prototype), (a.prototype = new d()), (a.__super__ = b.prototype), a;
			},
			c = {}.hasOwnProp