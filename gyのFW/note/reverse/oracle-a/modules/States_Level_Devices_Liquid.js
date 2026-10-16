// 模块: States/Level/Devices/Liquid  (init.beautified.js L57049-L57578)
      define("States/Level/Devices/Liquid", ["Phaser"], function () {
        "use strict";

        var c;
        return c = c = function (c) {
          function d(b, c, e, f) {
            this.melt = a(this.melt, this);
            this.freeze = a(this.freeze, this);
            this.initialFreeze = a(this.initialFreeze, this);
            this.shouldMelt = a(this.shouldMelt, this);
            this.shouldFreeze = a(this.shouldFreeze, this);
            this.update = a(this.update, this);
            this.createIceGraphics = a(this.createIceGraphics, this);
            this.createLiquidGraphics = a(this.createLiquidGraphics, this);
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            if (f.type === 55) {
              f.type = 5;
              f.startFrozen = true;
            }
            this.options = f;
            this.options.x = c;
            this.options.y = e;
            d.__super__.constructor.call(this, b, c, e, "GroundAssets", "_default0000");
            this.game.layers.liquids.addChild(this);
            this.game.physics.box2d.enable(this);
            this.body.clearFixtures();
            this.body.mass = 0;
            this.body.data.SetPosition(new box2d.b2Vec2(-c, -e));
            j = new box2d.b2PolygonShape();
            l = [];
            k = f.width;
            i = 1;
            l.push(new box2d.b2Vec2(0, -0.15));
            l.push(new box2d.b2Vec2(-k, -0.15));
            l.push(new box2d.b2Vec2(-k, -i / 2));
            l.push(new box2d.b2Vec2(0, -i / 2));
            j.Set(l);
            h = new box2d.b2FixtureDef();
            h.shape = j;
            h.filter.categoryBits = 1;
            h.filter.maskBits = 61695;
            h.friction = 0.7;
            h.isSensor = true;
            h.userData = {
              type: "liquid",
              liquidType: f.type,
              lightProperties: {
                type: "normal",
                sensor: true
              }
            };
            g = this.sensorFixture = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            j = new box2d.b2PolygonShape();
            l = [];
            k = f.width;
            i = 1;
            l.push(new box2d.b2Vec2(0, 0));
            l.push(new box2d.b2Vec2(-k, 0));
            l.push(new box2d.b2Vec2(-k, -i / 2));
            l.push(new box2d.b2Vec2(0, -i / 2));
            j.Set(l);
            h = new box2d.b2FixtureDef();
            h.shape = j;
            h.filter.categoryBits = 1;
            h.filter.maskBits = 0;
            h.friction = 0;
            h.userData = {
              type: "ice",
              liquidType: f.type,
              lightProperties: {
                type: "transparent"
              }
            };
            g = this.iceFixture = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            this.body.setFixtureContactCallback(this.iceFixture, function (a) {
              return function (a, b, c, d, e, f) {
                var g;
                if (b.sprite.character != null || a.sprite.character != null) {
                  g = b.sprite.character || a.sprite.character;
                  if (e) {
                    g.snowCount ||= 0;
                    g.snowCount += 1;
                  } else {
                    g.snowCount ||= 0;
                    g.snowCount -= 1;
                  }
                  return g.setOnIce(g.snowCount !== 0);
                }
              };
            }(this));
            j = new box2d.b2PolygonShape();
            l = [];
            k = f.width;
            i = 0.18;
            l.push(new box2d.b2Vec2(0, -i));
            l.push(new box2d.b2Vec2(-k, -i));
            l.push(new box2d.b2Vec2(-k, -1));
            l.push(new box2d.b2Vec2(0, -1));
            j.Set(l);
            h = new box2d.b2FixtureDef();
            h.shape = j;
            h.filter.categoryBits = 1;
            h.filter.maskBits = 4369;
            h.friction = 0.7;
            h.isSensor = true;
            h.userData = {
              type: "liquid_death",
              liquidType: f.type,
              lightProperties: {
                type: "transparent"
              }
            };
            g = this.killFixture = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            this.liquidGraphics = this.game.make.group();
            this.liquidGraphics.position.y = 2;
            this.createLiquidGraphics();
            this.addChild(this.liquidGraphics);
            if (f.type === 5) {
              this.iceGraphics = this.game.make.group();
              this.iceGraphics.position.y = 4;
              this.createIceGraphics();
              this.addChild(this.iceGraphics);
              this.iceGraphics.visible = false;
            }
            this.nearBodies = {};
            this.frozenBodies = {};
            this.body.setFixtureContactCallback(this.sensorFixture, function (a) {
              return function (b, c, d, e, f, g) {
                var h;
                if (f || a.nearBodies[c.id] == null) {
                  if (f && a.nearBodies[c.id] == null) {
                    h = {
                      body: c
                    };
                    return a.nearBodies[c.id] = h;
                  } else {
                    return undefined;
                  }
                } else {
                  return delete a.nearBodies[c.id];
                }
              };
            }(this), this);
            if (f.startFrozen) {
              _.delay(this.initialFreeze, 10);
            }
            return this;
          }
          b(d, c);
          d.prototype.createLiquidGraphics = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            if (this.options.type === 5) {
              a = "WaterBox";
            } else if (this.options.type === 6) {
              a = "FireBox";
            } else if (this.options.type === 7) {
              a = "GreenBox";
            }
            d = this.game.make.sprite(0, 0, "GroundAssets");
            d.anchor.set(0.5);
            d.animations.add("loop", Phaser.Animation.generateFrameNames(a + "Left", 0, 14, "", 4), 30, true);
            this.liquidGraphics.addChild(d);
            d.x = this.body.world.mpx(0.5);
            d.y = this.body.world.mpx(0.5);
            d.animations.play("loop");
            if (this.options.width > 2) {
              b = c = 1;
              f = this.options.width - 2;
              for (; f >= 1 ? c <= f : c >= f; b = f >= 1 ? ++c : --c) {
                e = this.game.make.sprite(0, 0, "GroundAssets");
                e.anchor.set(0.5);
                e.animations.add("loop", Phaser.Animation.generateFrameNames(a, 0, 14, "", 4), 30, true);
                this.liquidGraphics.addChild(e);
                e.x = this.body.world.mpx(b + 0.5);
                e.y = this.body.world.mpx(0.5);
                e.animations.play("loop");
              }
            }
            g = this.game.make.sprite(0, 0, "GroundAssets");
            g.anchor.set(0.5);
            g.animations.add("loop", Phaser.Animation.generateFrameNames(a + "Right", 0, 14, "", 4), 30, true);
            this.liquidGraphics.addChild(g);
            g.x = this.body.world.mpx(this.options.width - 0.5);
            g.y = this.body.world.mpx(0.5);
            return g.animations.play("loop");
          };
          d.prototype.createIceGraphics = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            a = "IceBox";
            d = this.game.make.sprite(0, 0, "GroundAssets", a + "Left0000");
            d.anchor.set(0.5);
            this.iceGraphics.addChild(d);
            d.x = this.body.world.mpx(0.5);
            d.y = this.body.world.mpx(0.5);
            b = c = 1;
            f = this.options.width - 2;
            for (; f >= 1 ? c <= f : c >= f; b = f >= 1 ? ++c : --c) {
              e = this.game.make.sprite(0, 0, "GroundAssets", a + "0000");
              e.anchor.set(0.5);
              this.iceGraphics.addChild(e);
              e.x = this.body.world.mpx(b + 0.5);
              e.y = this.body.world.mpx(0.5);
            }
            g = this.game.make.sprite(0, 0, "GroundAssets", a + "Right0000");
            g.anchor.set(0.5);
            this.iceGraphics.addChild(g);
            g.x = this.body.world.mpx(this.options.width - 0.5);
            return g.y = this.body.world.mpx(0.5);
          };
          d.prototype.update = function () {
            if (!this.game.physics.box2d.paused) {
              if (!this.ready) {
                this.ready = true;
                return;
              }
              if (this.sensorFixture.m_userData.lightProperties.iluminated != null) {
                if (this.sensorFixture.m_userData.lightProperties.iluminated === "blue" && this.options.type === 5) {
                  return this.shouldFreeze();
                }
                if (this.sensorFixture.m_userData.lightProperties.iluminated === "red" && this.options.type === 5) {
                  return this.shouldMelt();
                }
              }
            }
          };
          d.prototype.shouldFreeze = function () {
            if (!this.frozen) {
              this.freeze();
              return this.game.level.sounds.freeze.play();
            }
          };
          d.prototype.shouldMelt = function () {
            if (this.frozen) {
              this.game.level.sounds.melt.play();
              return this.melt();
            }
          };
          d.prototype.initialFreeze = function () {
            var a;
            var b;
            var c;
            this.game.physics.box2d.paused = false;
            this.game.physics.box2d.update();
            this.game.physics.box2d.paused = true;
            this.frozen = true;
            this.iceFixture.SetFilterData({
              maskBits: 16,
              categoryBits: 1
            });
            c = this.nearBodies;
            for (a in c) {
              b = c[a];
              if (b.body.data.m_userData === "pers") {
                b.body.data.SetPosition(b.body.data.GetPosition().SelfAdd(new box2d.b2Vec2(0, 0.5)));
                b.body.data.SetAwake(true);
              } else {
                this.frozenBodies[a] = b;
                b.body.static = true;
              }
            }
            this.iceFixture.Refilter();
            this.sensorFixture.m_userData.lightProperties.type = "mirror";
            this.iceGraphics.visible = true;
            return this.liquidGraphics.visible = false;
          };
          d.prototype.freeze = function () {
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
            b = 800;
            console.log("freezing");
            this.frozen = true;
            this.iceFixture.SetFilterData({
              maskBits: 16,
              categoryBits: 1
            });
            h = this.nearBodies;
            for (d in h) {
              e = h[d];
              if (e.body.data.m_userData === "pers") {
                e.body.data.SetPosition(e.body.data.GetPosition().SelfAdd(new box2d.b2Vec2(0, 0.5)));
                e.body.data.SetAwake(true);
              } else {
                this.frozenBodies[d] = e;
                e.body.static = true;
              }
            }
            this.iceFixture.Refilter();
            this.sensorFixture.m_userData.lightProperties.type = "mirror";
            this.iceGraphics.visible = true;
            c = this.game.make.graphics(0, 0);
            this.addChild(c);
            l = this.game.physics.box2d.mpx(this.options.width);
            c.beginFill(16777215);
            c.drawRect(-10, -10, l + 20, 52);
            a = this.sensorFixture.m_userData.lightProperties.lightAt;
            n = this.game.physics.box2d.mpx(-a.x - this.options.x);
            c.width = 0;
            c.x = n;
            i = this.game.add.tween(c).to({
              x: 0,
              width: l
            }, b, "Linear", true).onUpdateCallback(function (a) {
              return function () {
                if (a.frozen) {
                  return a.iceGraphics.mask = c;
                } else {
                  return c.visible = false;
                }
              };
            }(this));
            m = this.game.make.graphics(0, 0);
            this.addChild(m);
            m.width = l;
            m.x = 0;
            f = {
              val: l - n
            };
            i = this.game.add.tween(f).to({
              val: 0
            }, b, "Linear", true).onUpdateCallback(function (a) {
              return function () {
                if (a.frozen) {
                  m.clear();
                  m.beginFill(16777215);
                  m.drawRect(l - f.val, -10, f.val, 52);
                  return a.liquidGraphics.mask = m;
                } else {
                  return m.visible = false;
                }
              };
            }(this));
            g = {
              val: n
            };
            i = this.game.add.tween(g).to({
              val: 0
            }, b, "Linear", true).onUpdateCallback(function (a) {
              return function () {
                if (a.frozen) {
                  m.beginFill(16777215);
                  m.drawRect(0, -10, g.val, 52);
                  return a.liquidGraphics.mask = m;
                } else {
                  return m.visible = false;
                }
              };
            }(this));
            j = this.game.make.sprite(0, 0, "GroundAssets", "frost0000");
            k = this.game.make.sprite(0, 0, "GroundAssets", "frost0000");
            j.anchor.set(0.5);
            k.anchor.set(0.5);
            j.animations.add("loop", Phaser.Animation.generateFrameNames("frost", 0, 10, "", 4), 30, true);
            k.animations.add("loop", Phaser.Animation.generateFrameNames("frost", 0, 10, "", 4), 30, true);
            j.animations.play("loop");
            k.animations.play("loop");
            this.addChild(j);
            this.addChild(k);
            j.x = n;
            k.x = n;
            i = this.game.add.tween(j).to({
              x: 10
            }, b, "Linear", true);
            i = this.game.add.tween(k).to({
              x: l - 10
            }, b, "Linear", true);
            i.onComplete.add(function (a) {
              return function () {
                if (a.frozen) {
                  a.liquidGraphics.visible = false;
                }
                m.destroy();
                c.destroy();
                j.destroy();
                return k.destroy();
              };
            }(this));
          };
          d.prototype.melt = function () {
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
            e = 800;
            console.log("melting");
            this.frozen = false;
            this.iceFixture.SetFilterData({
              maskBits: 0,
              categoryBits: 1
            });
            i = this.frozenBodies;
            for (c in i) {
              f = i[c];
              f.body.static = false;
              delete this.frozenBodies[c];
            }
            this.iceFixture.Refilter();
            this.sensorFixture.m_userData.lightProperties.type = "normal";
            this.liquidGraphics.visible = true;
            d = this.game.make.graphics(0, 0);
            this.addChild(d);
            m = this.game.physics.box2d.mpx(this.options.width);
            d.beginFill(16777215);
            d.drawRect(0, -10, m, 52);
            a = this.sensorFixture.m_userData.lightProperties.lightAt;
            n = this.game.physics.box2d.mpx(-a.x - this.options.x);
            d.width = 0;
            d.x = n;
            j = this.game.add.tween(d).to({
              x: 0,
              width: m
            }, e, "Linear", true).onUpdateCallback(function (a) {
              return function () {
                if (a.frozen) {
                  return d.visible = false;
                } else {
                  return a.liquidGraphics.mask = d;
                }
              };
            }(this));
            b = this.game.make.graphics(0, 0);
            this.addChild(b);
            b.width = m;
            b.x = 0;
            g = {
              val: m - n
            };
            j = this.game.add.tween(g).to({
              val: 0
            }, e, "Linear", true).onUpdateCallback(function (a) {
              return function () {
                if (a.frozen) {
                  return b.visible = false;
                } else {
                  b.clear();
                  b.beginFill(16777215);
                  return b.drawRect(-10 + (m - g.val), -10, g.val + 20, 52);
                }
              };
            }(this));
            h = {
              val: n
            };
            j = this.game.add.tween(h).to({
              val: 0
            }, e, "Linear", true).onUpdateCallback(function (a) {
              return function () {
                if (a.frozen) {
                  return b.visible = false;
                } else {
                  b.beginFill(16777215);
                  b.drawRect(0, -10, h.val, 52);
                  return a.iceGraphics.mask = b;
                }
              };
            }(this));
            k = this.game.make.sprite(0, 0, "GroundAssets", "vapor0000");
            l = this.game.make.sprite(0, 0, "GroundAssets", "vapor0000");
            k.anchor.set(0.5);
            l.anchor.set(0.5);
            k.animations.add("loop", Phaser.Animation.generateFrameNames("vapor", 0, 10, "", 4), 30, true);
            l.animations.add("loop", Phaser.Animation.generateFrameNames("vapor", 0, 10, "", 4), 30, true);
            k.animations.play("loop");
            l.animations.play("loop");
            this.addChild(k);
            this.addChild(l);
            k.x = n;
            l.x = n;
            j = this.game.add.tween(k).to({
              x: 10
            }, e, "Linear", true);
            j = this.game.add.tween(l).to({
              x: m - 10
            }, e, "Linear", true);
            return j.onComplete.add(function (a) {
              return function () {
                if (!a.frozen) {
                  a.iceGraphics.visible = false;
                }
                d.destroy();
                b.destroy();
                k.destroy();
                return l.destroy();
              };
            }(this));
          };
          return d;
        }(Phaser.Sprite);
      });