// 模块: States/Level/Devices/Portal  (init.beautified.js L57872-L58289)
      define("States/Level/Devices/Portal", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.drawDarkMask = a(this.drawDarkMask, this);
            this.ocupy = a(this.ocupy, this);
            this.createFakeBlock = a(this.createFakeBlock, this);
            this.debugVector = a(this.debugVector, this);
            this.destroy = a(this.destroy, this);
            this.update = a(this.update, this);
            this.updateState = a(this.updateState, this);
            this.transport = a(this.transport, this);
            this.removeMask = a(this.removeMask, this);
            this.createMask = a(this.createMask, this);
            this.sounds = a(this.sounds, this);
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
            c.rotation ||= 0;
            d.__super__.constructor.call(this, b, c);
            this.center = g = this.game.make.sprite(this.options.x, this.options.y, "MechAssets");
            g.animations.add("loop", Phaser.Animation.generateFrameNames("portal_center", 0, 39, "", 4), 30, true);
            g.animations.play("loop");
            g.anchor.set(0.5);
            this.game.physics.box2d.enable(g);
            this.body = g.body;
            this.game.layers.liquids.addChild(g);
            this.glowLeft = j = this.game.make.sprite(this.options.x, this.options.y, "MechAssets");
            j.animations.add("loop", Phaser.Animation.generateFrameNames("portal_glow", 0, 29, "", 4), 30, true);
            j.animations.play("loop");
            j.anchor.set(0.5);
            j.scale.x = -1;
            j.rotation = this.options.rotation || 0;
            j.alpha = 0;
            j.tint = 0;
            this.game.layers.liquids.addChild(j);
            this.glowRight = k = this.game.make.sprite(this.options.x, this.options.y, "MechAssets");
            k.animations.add("loop", Phaser.Animation.generateFrameNames("portal_glow", 0, 29, "", 4), 30, true);
            k.animations.play("loop");
            k.anchor.set(0.5);
            k.rotation = this.options.rotation || 0;
            k.alpha = 0;
            this.game.layers.liquids.addChild(k);
            e = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "portal0000");
            e.anchor.set(0.5);
            e.rotation = this.options.rotation || 0;
            f = this.game.make.sprite(0, 0, "MechAssets", "portal_light_off0000");
            f.anchor.set(0.5);
            e.addChild(f);
            f.offFrameName = "portal_light_off0000";
            f.onFrameName = "portal_light_on0000";
            this.lights.push(f);
            this.game.layers.liquids.addChild(e);
            if (this.options.properties.inverted) {
              g.scale.x = -1;
              e.scale.x = -1;
              j.scale.x = 1;
              k.scale.x = -1;
            }
            this.body.clearFixtures();
            this.body.mass = 0;
            this.body.data.SetAngle(this.options.rotation);
            m = new box2d.b2PolygonShape();
            m.SetAsOrientedBox(this.options.sensorWidth, this.options.sensorHeigh, new box2d.b2Vec2(0, 0), 0);
            i = new box2d.b2FixtureDef();
            i.shape = m;
            i.density = 0;
            i.isSensor = true;
            i.filter.maskBits = 4096;
            i.filter.categoryBits = 4096;
            i.userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            this.sensorFixture = n = this.body.data.CreateFixture(i);
            n.id = this.body.world.getNextFixtureId();
            l = new box2d.b2PolygonShape();
            l.SetAsOrientedBox(this.options.lightSensorWidth, this.options.sensorHeigh, new box2d.b2Vec2(0, 0), 0);
            i = new box2d.b2FixtureDef();
            i.shape = l;
            i.density = 0;
            i.isSensor = false;
            i.filter.maskBits = 4096;
            i.filter.categoryBits = 4096;
            i.userData = {
              lightProperties: {
                type: "portal",
                getOutput: function (a) {
                  return function (b) {
                    var c;
                    var d;
                    d = b;
                    c = (a.other.options.rotation || 0) - (a.options.rotation || 0);
                    if (a.other.options.properties.inverted === a.options.properties.inverted) {
                      d.SelfRotateRadians(c + Math.PI);
                    } else {
                      d.SelfRotateRadians(c);
                    }
                    return d;
                  };
                }(this),
                getPoint: function (a) {
                  return function (b, c) {
                    var d;
                    var e;
                    c = new box2d.b2Vec2(0, 1).SelfRotateRadians(a.options.rotation || 0);
                    e = b.Clone().SelfSub(a.body.data.GetPosition());
                    if (a.other.options.properties.inverted !== a.options.properties.inverted) {
                      e = c.Clone().SelfMul(e.Dot(c) * 2 / c.Length()).SelfSub(e);
                    }
                    d = (a.other.options.rotation || 0) - (a.options.rotation || 0);
                    e.SelfRotateRadians(d);
                    return a.other.body.data.GetPosition().SelfAdd(e);
                  };
                }(this)
              },
              device: this
            };
            h = this.body.data.CreateFixture(i);
            h.id = this.body.world.getNextFixtureId();
            this.eventHorizon = h;
            this.registerDevice();
            this.nearBodies = {};
            this.body.setFixtureContactCallback(n, function (a) {
              return function (b, c, d, e, f, g) {
                var h;
                if (e.m_userData["portal-sensor"]) {
                  if (f || a.nearBodies[c.id] == null) {
                    if (a.state === 1 && f && a.nearBodies[c.id] == null) {
                      console.log("add", c.id);
                      h = {
                        body: c,
                        dist: null
                      };
                      a.createMask(h);
                      return a.nearBodies[c.id] = h;
                    } else {
                      return undefined;
                    }
                  } else {
                    console.log("remove", c.id);
                    h = a.nearBodies[c.id];
                    a.removeMask(h);
                    return delete a.nearBodies[c.id];
                  }
                }
              };
            }(this), this);
            this.body.setFixtureContactCallback(this.eventHorizon, function (a) {
              return function (b, c, d, e, f, g) {
                var h;
                var i;
                if (f) {
                  h = a.body.data.GetLocalPoint(c.data.GetPosition(), new box2d.b2Vec2()).x;
                  i = h > 0 && !a.options.properties.inverted || h < 0 && a.options.properties.inverted ? 1 : -1;
                  a.transporting ||= [];
                  return a.transporting.push({
                    body: c,
                    vel: c.data.GetLinearVelocity().Clone(),
                    side: i
                  });
                }
              };
            }(this), this);
            if (this.options.properties.inverted) {
              this.normal = new box2d.b2Vec2(1, 0);
            } else {
              this.normal = new box2d.b2Vec2(-1, 0);
            }
            this.normal.SelfRotateRadians(this.options.rotation || 0);
          }
          b(d, c);
          d.prototype.options = {
            sensorWidth: 2,
            sensorHeigh: 1.5,
            lightSensorWidth: 0.1
          };
          d.prototype.boxSize = {
            x: 2,
            y: 3
          };
          d.prototype.sounds = function () {
            return ["portalOpen", "portalLoop", "portalClose", "portalTransport"];
          };
          d.prototype.createMask = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            c = this.mpx(this.options.sensorHeigh * 3);
            d = this.game.make.graphics(0, 0);
            this.game.level.root.addChild(d);
            d.beginFill(16777215);
            f = new box2d.b2Vec2(-1, 0).SelfRotateRadians(this.options.rotation || 0);
            b = a.body.data.GetPosition().Clone().SelfSub(this.body.data.GetPosition());
            e = f.Dot(b) < 0 ? this.mpx(5) : -this.mpx(5);
            d.drawRect(0, -c, e, c * 2);
            d.x = this.options.x;
            d.y = this.options.y;
            d.angle = this.options.rotation * 180 / Math.PI || 0;
            a.mask = d;
            return a.body.sprite.mask = d;
          };
          d.prototype.removeMask = function (a) {
            a.body.sprite.mask = null;
            return a.mask.destroy();
          };
          d.prototype.transport = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            c = a.body;
            e = new box2d.b2Vec2(0, 1).SelfRotateRadians(this.options.rotation || 0);
            d = c.data.GetPosition().Clone().SelfSub(this.body.data.GetPosition());
            if (this.other.options.properties.inverted !== this.options.properties.inverted) {
              d = e.Clone().SelfMul(d.Dot(e) * 2 / e.Length()).SelfSub(d);
            }
            b = (this.other.options.rotation || 0) - (this.options.rotation || 0);
            d.SelfRotateRadians(b);
            c.data.SetPosition(this.other.body.data.GetPosition().SelfAdd(d));
            if (this.other.options.properties.inverted === this.options.properties.inverted) {
              g = a.vel.Clone().SelfRotateRadians(-b);
              g = e.Clone().SelfMul(g.Dot(e) * 2 / e.Length()).SelfSub(g);
            } else {
              g = a.vel.Clone().SelfRotateRadians(b);
            }
            c.data.SetLinearVelocity(g);
            if (g.Length() < 10) {
              f = this.other.normal.Clone();
              if (a.side === 1) {
                f.SelfMul(-1);
              }
              c.data.ApplyLinearImpulse(f.SelfMul(1 / c.data.GetMass()), c.data.GetWorldCenter());
            }
            this.game.physics.update();
            this.game.level.sounds.portalTransport.play();
            this.sensorFixture.Refilter();
            return this.eventHorizon.Refilter();
          };
          d.prototype.updateState = function (a) {
            if (this.state !== 1 || this.center.visible) {
              if (this.state === 0 && this.center.visible) {
                this.center.visible = false;
                this.eventHorizon.SetFilterData({
                  maskBits: 0,
                  categoryBits: 0
                });
                this.sensorFixture.SetFilterData({
                  maskBits: 0,
                  categoryBits: 0
                });
                if (this.sound != null) {
                  this.sound.stopInstance();
                  this.sound = null;
                }
                if (!a) {
                  this.game.level.sounds.portalClose.play();
                }
              }
            } else {
              this.center.visible = true;
              this.eventHorizon.SetFilterData({
                maskBits: 4096,
                categoryBits: 4096
              });
              this.sensorFixture.SetFilterData({
                maskBits: 4096,
                categoryBits: 4096
              });
              this.game.level.sounds.portalOpen.play();
              this.game.level.sounds.portalLoop.loop = true;
              if (!a) {
                this.sound = this.game.level.sounds.portalLoop.playInstance();
                this.sound.volume = 0.3;
              }
            }
            this.sensorFixture.Refilter();
            if (this.fakeWallFixture != null) {
              if (this.state === 1) {
                this.fakeWallFixture.SetFilterData({
                  maskBits: 0,
                  categoryBits: 0
                });
              } else {
                this.fakeWallFixture.SetFilterData({
                  maskBits: 4369,
                  categoryBits: 1
                });
              }
              return this.fakeWallFixture.Refilter();
            }
          };
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            if (this.state === 1 && Object.keys(this.nearBodies).length > 0) {
              c = Infinity;
              d = Infinity;
              g = this.nearBodies;
              for (b in g) {
                e = g[b];
                a = this.body.data.GetLocalPoint(e.body.data.GetPosition(), new box2d.b2Vec2()).x;
                if (this.options.properties.inverted) {
                  a *= -1;
                }
                if (a > 0) {
                  c = Math.min(c, a);
                } else {
                  d = Math.min(d, -a);
                }
              }
              if (c < Infinity) {
                this.glowLeft.alpha = this.other.glowLeft.alpha = Math.min(1, (2 - c) / 2 + 0.3);
              }
              if (d < Infinity) {
                this.glowRight.alpha = this.other.glowRight.alpha = Math.min(1, (2 - d) / 2 + 0.3);
              }
              if (this.sound != null) {
                this.sound.volume = 0.3 + Math.max(this.glowRight.alpha, this.glowLeft.alpha);
              }
            } else if (this.transporting == null && this.other.transporting == null && this.receiving == null && this.other.receiving == null && (this.state === 0 || Object.keys(this.nearBodies).length === 0 && Object.keys(this.other.nearBodies).length === 0)) {
              this.glowRight.alpha = this.other.glowRight.alpha = this.glowLeft.alpha = this.other.glowLeft.alpha = 0;
            }
            if (this.state === 1 && this.transporting != null) {
              while (f = this.transporting.shift()) {
                this.transport(f);
              }
              this.other.receiving = true;
              this.transporting = null;
            }
            this.receiving = null;
          };
          d.prototype.destroy = function () {
            if (this.sound != null) {
              this.sound.stopInstance();
            }
            return d.__super__.destroy.apply(this, arguments);
          };
          d.prototype.debugVector = function (a, b) {
            this.debugger.lineStyle(2, b, 1);
            this.debugger.moveTo(0, 0);
            return this.debugger.lineTo(this.mpx(a.x), this.mpx(a.y));
          };
          d.prototype.createFakeBlock = function (a) {
            var b;
            var c;
            var d;
            var e;
            e = this.game.make.sprite(0, 0, "MechAssets", "_default0000");
            this.game.physics.box2d.enable(e);
            b = e.body;
            b.clearFixtures();
            a.center.y -= Math.cos(this.options.rotation) * 0.5;
            a.center.x += Math.sin(this.options.rotation) * 0.5;
            d = new box2d.b2PolygonShape();
            d.SetAsOrientedBox(a.width, a.height, a.center, a.rotation);
            c = new box2d.b2FixtureDef();
            c.shape = d;
            this.fakeWallFixture = b.data.CreateFixture(c);
            return b.mass = 0;
          };
          d.prototype.ocupy = function (a) {
            var b;
            var c;
            b = this.options.x / 32;
            c = this.options.y / 32;
            this.ocupyTile(a, b, c + 2);
            this.ocupyTile(a, b - 1, c - 2);
            this.ocupyTile(a, b - 1, c + 2);
            return this.ocupyTile(a, b, c - 2);
          };
          d.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            var d;
            var e;
            if (this.state === 1) {
              a.ctx.globalCompositeOperation = "lighter";
              e = {
                x: this.center.x + a.offset.x,
                y: this.center.y + a.offset.y
              };
              b = new box2d.b2Vec2(0, 36).SelfRotateRadians(this.options.rotation);
              c = new box2d.b2Vec2(0, -36).SelfRotateRadians(this.options.rotation);
              d = a.ctx.createRadialGradient(e.x + b.x, e.y + b.y, 20, e.x + b.x, e.y + b.y, 90);
              d.addColorStop(0, "rgba(255,255,255,1)");
              d.addColorStop(0.5, "rgba(255,255,255,0.3)");
              d.addColorStop(1, "transparent");
              a.circle(e.x + b.x, e.y + b.y, 90, d);
              d = a.ctx.createRadialGradient(e.x + c.x, e.y + c.y, 20, e.x + c.x, e.y + c.y, 90);
              d.addColorStop(0, "rgba(255,255,255,1)");
              d.addColorStop(0.5, "rgba(255,255,255,0.3)");
              d.addColorStop(1, "transparent");
              return a.circle(e.x + c.x, e.y + c.y, 90, d);
            }
          };
          return d;
        }(c);
      });