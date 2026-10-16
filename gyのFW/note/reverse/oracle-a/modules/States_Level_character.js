// 模块: States/Level/character  (init.beautified.js L62846-L63459)
      define("States/Level/character", ["./CharCursors", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (d) {
          function e(b, d, f, g) {
            this.drawDarkMask = a(this.drawDarkMask, this);
            this.update = a(this.update, this);
            this.setFriction = a(this.setFriction, this);
            this.setOnIce = a(this.setOnIce, this);
            this.animateStairs = a(this.animateStairs, this);
            this.destroy = a(this.destroy, this);
            this._doKill = a(this._doKill, this);
            this.kill = a(this.kill, this);
            this.liquidTouched = a(this.liquidTouched, this);
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            var r;
            var s;
            this.maxSpeed = this.defaultMaxSpeed;
            e.__super__.constructor.call(this, b);
            d += this.game.physics.box2d.mpx(1);
            f -= this.game.physics.box2d.mpx(1);
            this.data = {
              char: g,
              diamonds: 0,
              silverDiamond: 0
            };
            this.sprite = this.game.make.sprite(d, f, "CharAssets", "_default0000");
            this.sprite.character = this;
            this.sprite.scale.x = this.spriteScale;
            this.sprite.scale.y = this.spriteScale;
            this.game.layers.chars.addChild(this.sprite);
            this.game.physics.box2d.enable(this.sprite);
            this.body = this.sprite.body;
            this.body.clearFixtures();
            this.body.fixedRotation = true;
            this.body.data.m_userData = "pers";
            this.body.data.SetBullet(true);
            this.signal = new Phaser.Signal();
            m = function (a) {
              return function (b, c, d) {
                var e;
                var f;
                var g;
                e = new box2d.b2CircleShape(b);
                e.m_p.SetXY(c[0], c[1]);
                g = new box2d.b2FixtureDef();
                g.shape = e;
                g.density = 0;
                g.filter.categoryBits = 16;
                g.filter.maskBits = 4353;
                g.friction = d;
                f = a.body.data.CreateFixture(g);
                f.id = a.body.world.getNextFixtureId();
                return f;
              };
            }(this);
            n = function (a) {
              return function (b, c, d, e) {
                var f;
                var g;
                var h;
                var i;
                var j;
                j = [];
                f = a.dr;
                j.push(new box2d.b2Vec2(b - f, d));
                j.push(new box2d.b2Vec2(-b + f, d));
                j.push(new box2d.b2Vec2(c - f, e));
                j.push(new box2d.b2Vec2(-c + f, e));
                i = new box2d.b2PolygonShape();
                i.Set(j);
                h = new box2d.b2FixtureDef();
                h.shape = i;
                h.friction = 0;
                h.density = 1.4;
                h.filter.categoryBits = 16;
                h.filter.maskBits = 4353;
                g = a.body.data.CreateFixture(h);
                g.id = a.body.world.getNextFixtureId();
                return g;
              };
            }(this);
            p = this.r1;
            q = this.r2;
            r = this.y1;
            s = this.y2;
            h = new box2d.b2CircleShape(0.1);
            h.m_p.SetXY(0, 0);
            i = new box2d.b2FixtureDef();
            i.shape = h;
            i.density = 0;
            i.filter.categoryBits = 4096;
            i.filter.maskBits = 4096;
            i.filter.groupIndex = -1;
            i.friction = 0;
            this.portalSensor = this.body.data.CreateFixture(i);
            this.portalSensor.id = this.body.world.getNextFixtureId();
            this.portalSensor.m_userData = {
              "portal-sensor": true
            };
            m(p, [0, r], 0);
            this.feetSensor = m(q, [0, s], this.feetFriction);
            n(p, q, r, s);
            this.feetSensor.m_userData = "feet";
            this.feetSensor.contacts = [];
            o = g === "fb" ? "fire" : "water";
            this.prefix = o;
            this.bodySprite = b.make.sprite(0, 0, "CharAssets", "_default0000");
            this.sprite.addChild(this.bodySprite);
            l = b.make.sprite(0, 0, "CharAssets");
            l.anchor.set(0.5);
            l.animations.add("running", Phaser.Animation.generateFrameNames(o + "_legs_running", 0, 7, "", 4), 30, true);
            if (this.data.char === "wg") {
              l.animations.add("onice", Phaser.Animation.generateFrameNames(o + "_legs_running", 0, 7, "", 4), 10, true);
            }
            l.frameName = o + "_legs_idle0000";
            this.bodySprite.addChild(l);
            j = b.make.sprite(0, 0, "CharAssets");
            j.animations.add("idle", Phaser.Animation.generateFrameNames(o + "_head_idle", 0, 29, "", 4), 30, true);
            j.animations.add("falling", Phaser.Animation.generateFrameNames(o + "_head_falling", 0, 4, "", 4), 30, true);
            j.animations.add("jumping", Phaser.Animation.generateFrameNames(o + "_head_jumping", 0, 10, "", 4), 30, true);
            j.animations.add("rising", Phaser.Animation.generateFrameNames(o + "_head_rising", 0, 4, "", 4), 30, true);
            j.anchor.set(0.5);
            j.animations.play("idle");
            this.bodySprite.addChild(j);
            k = b.make.sprite(0, 0, "CharAssets");
            k.anchor.set(0.5);
            k.animations.add("loop", Phaser.Animation.generateFrameNames(o + "_ice_legs", 0, 4, "", 4), 10, true);
            k.visible = false;
            this.bodySprite.addChild(k);
            this.bodyParts = {};
            this.bodyParts.legs = l;
            this.bodyParts.ice = k;
            this.bodyParts.head = j;
            this.bodySprite.hitArea = new PIXI.Circle(0, 0, l.height * 0.65);
            this.body.setFixtureContactCallback(this.feetSensor, function (a) {
              return function (b, c, d, e, f, g) {
                var h;
                if (e.m_isSensor) {
                  if (e.m_userData != null && e.m_userData.type === "liquid_death") {
                    if (f) {
                      a.liquidTouched(e.m_userData.liquidType);
                      return a.isOnLiquid = true;
                    } else {
                      return a.isOnLiquid = false;
                    }
                  }
                } else {
                  if (f && g.m_manifold.localNormal.Length() > 0) {
                    return a.feetSensor.contacts.push(g);
                  }
                  if ((h = a.feetSensor.contacts.indexOf(g)) >= 0) {
                    return a.feetSensor.contacts.splice(h, 1);
                  }
                }
              };
            }(this), this);
            this.cursors = new c(this.game, g);
            this.sprite.char = this.char = g;
            return this;
          }
          b(e, d);
          e.prototype.facing = "left";
          e.prototype.feetFriction = 0.5;
          e.prototype.r1 = 0.48;
          e.prototype.r2 = 0.2;
          e.prototype.dr = 0.03;
          e.prototype.y1 = 0.2;
          e.prototype.y2 = -0.9;
          e.prototype.spriteScale = 0.95;
          e.prototype.jumpImpulse = 1;
          e.prototype.jumpVelocity = 15.5;
          e.prototype.jumpIceVelocity = 10;
          e.prototype.runForce = 50;
          e.prototype.floatForce = 30;
          e.prototype.defaultMaxSpeed = 8.5;
          e.prototype.waterIceMaxSpeed = 2;
          e.prototype.absoluteMaxSpeed = 40;
          e.prototype.liquidTouched = function (a) {
            if (a !== 7 && (this.char !== "wg" || a !== 6) && (this.char !== "fb" || a !== 5)) {
              return;
            }
            if (GameConfig.cheating.isInvulnerable) {
              if (!this.dying) {
                var a;
                var b;
                this.game.level.sounds.death.play();
                b = this.game.make.sprite(0, this.game.physics.box2d.mpx(1) * -0.7, "CharAssets");
                a = b.animations.add("play", Phaser.Animation.generateFrameNames("death_smoke", 0, 45, "", 4), 30, false);
                if (this.body.data.GetLinearVelocity().x < 0) {
                  b.scale.x = -1;
                }
                b.animations.play("play");
                b.anchor.set(0.5);
                a.killOnComplete = true;
                this.sprite.addChild(b);
              }
              return;
            }
            return this.kill();
          };
          e.prototype.kill = function () {
            if (!this.dying) {
              this.dying = true;
              return _.delay(this._doKill, 0);
            }
          };
          e.prototype._doKill = function () {
            var a;
            var b;
            this.game.level.sounds.death.play();
            this.game.level.sounds.levelMusic.stop();
            this.game.level.sounds.levelMusicOver.play();
            b = this.game.make.sprite(0, this.game.physics.box2d.mpx(1) * -0.7, "CharAssets");
            a = b.animations.add("play", Phaser.Animation.generateFrameNames("death_smoke", 0, 45, "", 4), 30, false);
            if (this.body.data.GetLinearVelocity().x < 0) {
              b.scale.x = -1;
            }
            b.animations.play("play");
            b.anchor.set(0.5);
            a.onComplete.add(function (a) {
              return function () {
                a.sprite.visible = false;
                a.isDead = true;
                return a.signal.dispatch();
              };
            }(this));
            this.sprite.addChild(b);
            return this.dead = true;
          };
          e.prototype.destroy = function () {
            e.__super__.destroy.apply(this, arguments);
            return this.cursors.destroy();
          };
          e.prototype.animateStairs = function (a) {
            var b;
            this.bodyParts.head.visible = false;
            this.bodyParts.legs.visible = false;
            b = this.game.make.sprite(0, 0, "CharAssets");
            b.animations.add("up", Phaser.Animation.generateFrameNames(this.prefix + "_stairs", 0, 30, "", 4), 25, false);
            b.anchor.set(0.5, 1);
            this.game.add.tween(b.scale).to({
              x: 0.8,
              y: 0.8
            }, 360, Phaser.Easing.Linear.None, true, 0);
            this.sprite.addChild(b);
            this.body.x = a.pos.x;
            this.body.y = a.pos.y + 4;
            return b.animations.play("up");
          };
          e.prototype.setOnIce = function (a) {
            if (a && !this.isOnIce) {
              this.isOnIce = true;
              return this.setFriction();
            } else if (!a && this.isOnIce) {
              this.isOnIce = false;
              return this.setFriction();
            } else {
              return undefined;
            }
          };
          e.prototype.setFriction = function () {
            var a;
            var b;
            if (this.data.char === "fb") {
              if (this.isOnIce) {
                this.feetSensor.m_friction = 0;
                this.maxSpeed = this.defaultMaxSpeed;
              } else {
                this.feetSensor.m_friction = this.feetFriction;
                this.maxSpeed = this.defaultMaxSpeed;
              }
            }
            if (this.data.char === "wg") {
              if (this.isOnIce) {
                this.feetSensor.m_friction = 0.7;
                this.maxSpeed = this.waterIceMaxSpeed;
              } else {
                this.feetSensor.m_friction = this.feetFriction;
                this.maxSpeed = this.defaultMaxSpeed;
              }
            }
            this.feetSensor.Refilter();
            a = this.feetSensor.m_body.m_contactList;
            b = [];
            while (a != null) {
              a.contact.ResetFriction();
              b.push(a = a.next);
            }
            return b;
          };
          e.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            var r;
            var s;
            var t;
            var u;
            var v;
            var w;
            if ((this.game.level == null || !this.game.level.ended) && !this.game.physics.box2d.paused) {
              if (this.dying) {
                this.bodySprite.visible = false;
                this.bodyParts.legs.visible = false;
                this.bodyParts.head.visible = false;
                if (this.dead) {
                  this.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
                }
                return;
              }
              k = this.jumpImpulse;
              l = this.jumpVelocity;
              s = this.runForce;
              h = this.floatForce;
              m = this.defaultMaxSpeed;
              if ((this.cursors.right.isDown || this.cursors.left.isDown) && this.isOnLiquid) {
                if (!this.waterplaying) {
                  this.waterplaying = true;
                  this.game.level.sounds.waterSteps.loop = true;
                  this.game.level.sounds.waterSteps.volume = 0.5;
                  this.game.level.sounds.waterSteps.play();
                }
              } else if (this.waterplaying === true) {
                this.waterplaying = false;
                this.game.level.sounds.waterSteps.stop();
              }
              if ((this.cursors.right.isDown || this.cursors.left.isDown) && this.isOnIce) {
                if (!this.iceplaying) {
                  this.iceplaying = true;
                  this.game.level.sounds["iceSteps_" + this.data.char].loop = true;
                  this.game.level.sounds["iceSteps_" + this.data.char].play();
                }
              } else if (this.iceplaying === true) {
                this.iceplaying = false;
                this.game.level.sounds["iceSteps_" + this.data.char].stop();
              }
              j = new box2d.b2Vec2(0, -1);
              if (this.feetSensor.contacts.length > 0) {
                _.each(this.feetSensor.contacts, function (a) {
                  return function (a) {
                    a.m_normal ||= new box2d.b2Vec2();
                    return a.m_fixtureA.m_body.GetWorldVector(a.m_manifold.localNormal, a.m_normal);
                  };
                }(this));
                this.feetSensor.contacts = _.sortBy(this.feetSensor.contacts, function (a) {
                  return function (a) {
                    return a.m_normal.Dot(j);
                  };
                }(this));
                d = this.feetSensor.contacts[0];
                n = d.m_normal;
              }
              g = this.game.time.elapsed / 1000;
              e = g * 130 / this.currentRunForce;
              if (this.body.data.GetLinearVelocity().Length() < 1 && this.currentRunForce > s * 0.5) {
                e = s;
              }
              if (this.cursors.left.isDown) {
                if (d != null) {
                  if (this.currentRunForce < s) {
                    this.currentRunForce = Math.min(this.currentRunForce + e, s);
                  }
                  p = n.y > 0.6 ? n.y : 0;
                  i = n.Clone().SelfCrossSV(-this.currentRunForce).SelfMul(Math.max(0, Math.sqrt(p)));
                  if (p > 0.6 && i.y >= 0 && i.y < 20) {
                    i.y += 20;
                  }
                } else {
                  i = new box2d.b2Vec2(h, 0);
                }
              } else if (this.cursors.right.isDown) {
                if (d != null) {
                  if (this.currentRunForce < s) {
                    this.currentRunForce = Math.min(this.currentRunForce + e, s);
                  }
                  p = n.y > 0.6 ? n.y : 0;
                  i = n.Clone().SelfCrossSV(this.currentRunForce).SelfMul(Math.max(0, Math.sqrt(p)));
                  if (p > 0.6 && i.y >= 0 && i.y < 20) {
                    i.y += 20;
                  }
                } else {
                  i = new box2d.b2Vec2(-h, 0);
                }
              } else {
                this.currentRunForce = s * 0.475;
                if (this.isOnIce && this.data.char === "wg") {
                  i = new box2d.b2Vec2(-this.body.data.GetLinearVelocity().x * 20, 0);
                  this.body.data.SetLinearVelocity(new box2d.b2Vec2(0, 0));
                } else {
                  i = new box2d.b2Vec2(-this.body.data.GetLinearVelocity().x * 7, 0);
                }
              }
              if (this.prohibitJump && !this.cursors.up.isDown) {
                this.prohibitJump = false;
              }
              if (!this.prohibitJump && this.cursors.up.isDown && (n != null && n.y > 0.2 || this.feetSensor.contacts.length >= 2)) {
                this.body.data.ApplyLinearImpulse({
                  x: 0,
                  y: k
                }, {
                  x: 0,
                  y: 0
                });
                if (this.isOnIce) {
                  if (this.data.char === "fb") {
                    if (n.y > 0.9) {
                      v = new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, n.y * 3);
                      this.body.data.SetLinearVelocity(v);
                    } else {
                      v = new box2d.b2Vec2(n.x * 3, n.y * 3);
                      this.body.data.SetLinearVelocity(v);
                    }
                  } else {
                    v = new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, this.jumpIceVelocity);
                    this.body.data.SetLinearVelocity(v);
                  }
                } else {
                  v = n.y > 0.65 ? new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, this.jumpVelocity) : new box2d.b2Vec2(this.body.data.GetLinearVelocity().x, Math.sqrt(Math.sqrt(n.y)) * this.jumpVelocity);
                  if (v.Length() > this.jumpVelocity) {
                    v.SelfNormalize().SelfMul(this.jumpVelocity);
                  }
                  this.body.data.SetLinearVelocity(v);
                  f = true;
                }
                q = this.feetSensor.m_body.m_contactList;
                r = new box2d.b2Vec2(0, -1);
                w = r;
                while (q != null) {
                  c = q.contact.m_fixtureA.m_body;
                  if (c.m_userData === "reactable") {
                    c.ApplyLinearImpulse(r, {
                      x: 0,
                      y: 0
                    }, true);
                  }
                  q = q.next;
                }
                this.prohibitJump = true;
                if (this.char === "wg") {
                  this.game.level.sounds.jump_wg.play();
                } else {
                  this.game.level.sounds.jump_fb.play();
                }
              }
              if (i != null) {
                if (f) {
                  i.y = 0;
                  f = false;
                }
                if (this.isOnIce) {
                  if (this.data.char === "fb") {
                    i.SelfMul(0.2);
                  }
                  if (this.data.char === "wg") {
                    i.SelfMul(1);
                  }
                  u = this.body.data.GetLinearVelocity();
                  if (u.Length() > this.maxSpeed) {
                    u.SelfNormalize().SelfMul(this.maxSpeed);
                    this.body.data.SetLinearVelocity(u);
                  }
                }
                u = this.body.data.GetLinearVelocity();
                if (i.x > 0 && u.x < this.maxSpeed) {
                  this.body.data.ApplyForce(i, {
                    x: 0,
                    y: 0
                  });
                }
                if (i.x < 0 && u.x > -this.maxSpeed) {
                  this.body.data.ApplyForce(i, {
                    x: 0,
                    y: 0
                  });
                }
              }
              if (u.Length() > this.absoluteMaxSpeed) {
                u.SelfNormalize().SelfMul(this.absoluteMaxSpeed);
                this.body.data.SetLinearVelocity(u);
              }
              u = this.body.data.GetLinearVelocity();
              o = u.Clone().SelfNormalize();
              a = Math.atan2(Math.max(-0.333, o.y), o.x);
              if (n != null) {
                if (this.cursors.left.isDown) {
                  b = "jumping";
                  t = -1;
                  a = Math.atan2(n.y, n.x) - Math.PI / 2;
                  a = Math.max(Math.min(a, Math.PI * 0.25), -Math.PI * 0.1);
                } else if (this.cursors.right.isDown) {
                  b = "jumping";
                  t = 1;
                  a = Math.atan2(n.y, n.x) - Math.PI / 2;
                  a = Math.max(Math.min(a, Math.PI * 0.1), -Math.PI * 0.25);
                } else {
                  b = "idle";
                  t = 1;
                  a = 0;
                }
              } else if (u.x > 4) {
                b = "jumping";
                t = -1;
                a = a;
              } else if (u.x < -4) {
                b = "jumping";
                t = 1;
                a += Math.PI;
              } else if (u.y > 3) {
                b = "rising";
                t = 1;
                a = 0;
              } else if (u.y < -3) {
                b = "falling";
                t = 1;
                a = 0;
              } else if (this.cursors.left.isDown) {
                b = "jumping";
                t = -1;
                a = this.bodyParts.head.rotation;
              } else if (this.cursors.right.isDown) {
                b = "jumping";
                t = 1;
                a = this.bodyParts.head.rotation;
              } else {
                b = "idle";
                t = 1;
                a = 0;
              }
              this.bodyParts.head.scale.set(t, 1);
              this.bodyParts.head.rotation = a;
              this.bodyParts.head.animations.play(b);
              if (b === "rising") {
                if (this.bodyParts.legs.renderOrderID < this.bodyParts.head.renderOrderID) {
                  this.sprite.removeChild(this.bodyParts.legs, false, true);
                  this.sprite.addChild(this.bodyParts.legs, true);
                }
              } else if (this.bodyParts.legs.renderOrderID > this.bodyParts.head.renderOrderID) {
                this.sprite.removeChild(this.bodyParts.head, false, true);
                this.sprite.addChild(this.bodyParts.head, true);
              }
              if (b === "jumping") {
                if (t === -1 && this.facing !== "left") {
                  this.bodyParts.legs.scale.set(-1, 1);
                  this.bodyParts.ice.scale.set(-1, 1);
                  this.facing = "left";
                }
                if (t === 1 && this.facing !== "right") {
                  this.bodyParts.legs.scale.set(1, 1);
                  this.bodyParts.ice.scale.set(1, 1);
                  this.facing = "right";
                }
                if (this.isOnIce) {
                  this.bodyParts.ice.animations.play("loop");
                  this.bodyParts.ice.visible = true;
                } else {
                  this.bodyParts.ice.animations.stop();
                  this.bodyParts.ice.visible = false;
                }
                if (this.data.char === "wg" && this.isOnIce) {
                  this.bodyParts.legs.animations.play("onice");
                } else {
                  this.bodyParts.legs.animations.play("running");
                }
              } else if (this.facing !== "idle") {
                this.bodyParts.ice.animations.stop();
                this.bodyParts.ice.visible = false;
                this.bodyParts.legs.animations.stop();
                this.bodyParts.legs.frameName = this.prefix + "_legs_idle0000";
                this.facing = "idle";
              }
            }
          };
          e.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            a.ctx.globalCompositeOperation = "lighter";
            c = {
              x: this.sprite.x + a.offset.x,
              y: this.sprite.y + a.offset.y
            };
            b = a.ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 180);
            b.addColorStop(0, "rgba(255,255,255,1)");
            b.addColorStop(0.5, "rgba(255,255,255,0.3)");
            b.addColorStop(1, "transparent");
            return a.circle(c.x, c.y, 220, b);
          };
          return e;
        }(Phaser.Group);
      });