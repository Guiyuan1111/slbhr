// 模块: States/Level/Devices/Door  (init.beautified.js L56432-L56540)
      define("States/Level/Devices/Door", ["Phaser"], function () {
        "use strict";

        var c;
        return c = c = function (c) {
          function d(b, c, e, f) {
            this.update = a(this.update, this);
            var g;
            var h;
            var i;
            var j;
            d.__super__.constructor.call(this, b);
            c += this.game.physics.box2d.mpx(1);
            this.pos = {
              x: c,
              y: e
            };
            i = f === "fb" ? "FinishBoy" : "FinishGirl";
            this.sprite = this.game.make.sprite(c, e + 4, "TempleAssets", i + "0000");
            this.sprite.scale.set(0.8);
            this.sprite.animations.add("open", Phaser.Animation.generateFrameNames(i, 0, 21, "", 4), 10, false);
            this.game.physics.box2d.enable(this.sprite);
            this.body = this.sprite.body;
            this.sprite.anchor.y = 0.99;
            this.game.layers.background.addChild(this.sprite);
            this.signal = new Phaser.Signal();
            this.body.clearFixtures();
            this.body.data.SetType(box2d.b2BodyType.b2_staticBody);
            j = new box2d.b2PolygonShape();
            j.SetAsOrientedBox(this.game.physics.box2d.pxm(this.options.width / 2), this.game.physics.box2d.pxm(this.options.height / 2), new box2d.b2Vec2(0, 0), 0);
            h = new box2d.b2FixtureDef();
            h.shape = j;
            h.friction = 0.7;
            h.restitution = 0;
            h.density = 0;
            h.userData = "door-" + f;
            h.isSensor = true;
            this.data = {
              char: f
            };
            g = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            this.body.setFixtureContactCallback(g, function (a) {
              return function (b, c, d, e, f, g) {
                if (c.sprite.character != null && c.sprite.character.data.char === a.data.char) {
                  if (f) {
                    return a.isOpen = true;
                  } else {
                    return a.isOpen = false;
                  }
                }
              };
            }(this), this);
            this.currentFrac = this.sprite.animations.currentFrame.index;
            return this;
          }
          b(d, c);
          d.prototype.options = {
            width: 64,
            height: 8
          };
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            a = this.sprite.animations._outputFrames.indexOf(this.sprite.animations.currentFrame.index);
            if (a === 21) {
              this.isUp = true;
            } else {
              this.isUp = false;
            }
            b = Math.min(0.04, this.game.time.elapsed / 1000);
            c = b * 25;
            if (this.isOpen) {
              if (a < 21) {
                this.currentFrac += c;
                this.sprite.animations.frame = Math.round(this.currentFrac);
                if (this.sound == null || !this.sound.isPlaying) {
                  this.sound = this.game.level.sounds.door.playInstance();
                }
              }
              if (a === 21) {
                this.signal.dispatch();
                if (this.sound != null) {
                  this.sound.stopInstance();
                  this.sound = null;
                }
              }
            } else if (!this.isOpen) {
              if (a > 0) {
                this.currentFrac -= c;
                this.sprite.animations.frame = Math.round(this.currentFrac);
                if (this.sound == null || !this.sound.isPlaying) {
                  this.sound = this.game.level.sounds.door.playInstance();
                }
              }
              if (a === 0) {
                if (this.sound != null) {
                  this.sound.stopInstance();
                  this.sound = null;
                }
                this.signal.dispatch();
              }
            }
            return this.isUp;
          };
          return d;
        }(Phaser.Group);
      });