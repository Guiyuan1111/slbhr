// 模块: States/Level/Devices/Wind  (init.beautified.js L59432-L59643)
      define("States/Level/Devices/Wind", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.drawDarkMask = a(this.drawDarkMask, this);
            this.ocupy = a(this.ocupy, this);
            this.updateState = a(this.updateState, this);
            this.update = a(this.update, this);
            this.destroy = a(this.destroy, this);
            this.sounds = a(this.sounds, this);
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            c.rotation ||= 0;
            c.rotation += 90;
            d.__super__.constructor.call(this, b, c);
            this.sprite.anchor.set(0.5);
            i = new box2d.b2PolygonShape();
            if (this.options.properties.flat) {
              i.SetAsOrientedBox(this.options.boxWidth / 2, this.options.boxHeight / 2, new box2d.b2Vec2(0, 0.3), 0);
            } else {
              j = [];
              j.push(new box2d.b2Vec2(-this.options.boxWidth / 2 - 0.6, 0));
              j.push(new box2d.b2Vec2(this.options.boxWidth / 2 + 0.6, 0));
              j.push(new box2d.b2Vec2(this.options.boxWidth / 2, this.options.boxHeight));
              j.push(new box2d.b2Vec2(-this.options.boxWidth / 2, this.options.boxHeight));
              i.Set(j);
            }
            f = new box2d.b2FixtureDef();
            f.shape = i;
            f.friction = 0.4;
            f.restitution = 0;
            f.density = 0.2;
            g = new box2d.b2Vec2(0, 0);
            g = g.SelfRotateRadians(this.options.rotation || 0);
            e = this.body.data.CreateFixture(f);
            e.id = this.body.world.getNextFixtureId();
            this.body.mass = 0;
            l = this.options.properties.windWidth ?? this.options.windWidth;
            h = new box2d.b2PolygonShape();
            h.SetAsOrientedBox(l / 2, this.options.properties.length / 2, new box2d.b2Vec2(0, this.options.properties.length / 2 + 0.5), 0);
            f = new box2d.b2FixtureDef();
            f.shape = h;
            f.isSensor = true;
            f.userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            this.windSensor = this.body.data.CreateFixture(f);
            this.windSensor.id = this.body.world.getNextFixtureId();
            this.body.mass = 0;
            this.activeBodies = {};
            this.body.setFixtureContactCallback(this.windSensor, function (a) {
              return function (b, c, d, e, f, g) {
                var h;
                if (c.sprite.character != null) {
                  if (!f && a.activeBodies[c.id] != null) {
                    return delete a.activeBodies[c.id];
                  }
                  if (f && a.activeBodies[c.id] == null) {
                    h = {
                      body: c
                    };
                    return a.activeBodies[c.id] = h;
                  }
                }
              };
            }(this));
            this.sprite.animations.add("loop", Phaser.Animation.generateFrameNames("wind_base", 0, 4, "", 4), 30, true);
            k = this.windEffect = this.game.make.sprite(this.options.x - b.physics.box2d.mpx(g.x), this.options.y - b.physics.box2d.mpx(g.y), "MechAssets");
            k.anchor.y = 1;
            k.anchor.x = 0.5;
            k.animations.add("loop", Phaser.Animation.generateFrameNames("wind_effect", 0, 30, "", 4), 30, true);
            k.animations.play("loop");
            k.animations.next(Math.floor(Math.random() * 30));
            k.height = b.physics.box2d.mpx(this.options.properties.length);
            k.rotation = this.options.rotation || 0;
            k.visible = false;
            this.game.layers.overChars.addChild(k);
            this.registerDevice();
          }
          b(d, c);
          d.prototype.options = {
            boxWidth: 2.5,
            boxHeight: 0.6,
            windWidth: 2.6,
            windHeight: 10,
            atlasName: "MechAssets",
            frameName: "wind_base0000",
            lightAtlas: "MechAssets",
            lightFrame: "wind_base_light",
            layer: "liquids"
          };
          d.prototype.boxSize = {
            x: -3,
            y: 2
          };
          d.prototype.sounds = function () {
            return "wind";
          };
          d.prototype.destroy = function () {
            if (this.sound != null) {
              this.sound.stopInstance();
            }
            return d.__super__.destroy.apply(this, arguments);
          };
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            g = this.options.properties.invertInput ? +!this.state : this.state;
            if (g === 1) {
              e = this.activeBodies;
              f = [];
              for (c in e) {
                d = e[c];
                b = new box2d.b2Vec2(0, 1);
                b = b.SelfRotateRadians(this.options.rotation || 0);
                a = d.body.data.GetPosition().SelfSub(this.body.data.GetPosition());
                b.SelfMul(1.2 + Math.sin(this.game.time.now / 1000) * 0.2).SelfMul(100).SelfMul(1 - a.GetLength() / this.options.properties.length);
                d.body.data.ApplyForce(b, new box2d.b2Vec2(0, 0));
                // Damping factor should be dependent on delta time, not constant.
                // Use 60 as reference since the game assumed 60FPS.
                // Note that the this.game.time.elapsed is in milliseconds.
                d.body.data.SetLinearVelocity(d.body.data.GetLinearVelocity().SelfMul(0.975 ** (this.game.time.elapsed / (1000 / 60))));
                // Speed cap
                h = d.body.data.GetLinearVelocity().GetLength();
                f.push(d.body.data.SetLinearVelocity(d.body.data.GetLinearVelocity().SelfNormalize().SelfMul(Math.min(h, 15))));
              }
              return f;
            }
          };
          d.prototype.updateState = function () {
            var a;
            this.running ||= false;
            a = this.options.properties.invertInput ? +!this.state : this.state;
            if (a === 1 && this.windEffect.visible === false) {
              this.windEffect.visible = true;
              this.sprite.animations.play("loop");
              this.running = true;
              this.game.level.sounds.wind.loop = true;
              this.sound = this.game.level.sounds.wind.playInstance();
              return this.sound.volume = 0.2;
            } else if (a === 0 && this.windEffect.visible === true) {
              this.windEffect.visible = false;
              if (this.sound != null) {
                this.sound.stopInstance();
                this.sound = null;
              }
              return _.delay(function (a) {
                return function () {
                  a.sprite.animations.stop();
                  return a.sprite.frameName = "wind_base0000";
                };
              }(this), 400);
            } else {
              return undefined;
            }
          };
          d.prototype.ocupy = function (a) {
            var b;
            var c;
            b = this.options.x / 32;
            c = this.options.y / 32;
            this.ocupyTile(a, b - 1, c);
            this.ocupyTile(a, b - 1, c - 1);
            this.ocupyTile(a, b, c);
            this.ocupyTile(a, b, c - 1);
            this.ocupyTile(a, b - 2, c);
            return this.ocupyTile(a, b - 2, c - 1);
          };
          d.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            var d;
            var e;
            if (this.state === 1) {
              a.ctx.globalCompositeOperation = "lighter";
              e = {
                x: this.sprite.x + a.offset.x,
                y: this.sprite.y + a.offset.y
              };
              b = new box2d.b2Vec2(36, 0).SelfRotateRadians(this.options.rotation);
              c = new box2d.b2Vec2(-36, 0).SelfRotateRadians(this.options.rotation);
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