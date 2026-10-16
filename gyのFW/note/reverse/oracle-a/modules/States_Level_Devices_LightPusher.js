// 模块: States/Level/Devices/LightPusher  (init.beautified.js L56945-L57026)
      define("States/Level/Devices/LightPusher", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.checkState = a(this.checkState, this);
            this.sounds = a(this.sounds, this);
            var e;
            var f;
            var g;
            var h;
            var i;
            d.__super__.constructor.call(this, b, c);
            this.body.mass = 0;
            f = new box2d.b2PolygonShape();
            f.SetAsOrientedBox(this.options.sensorWidth / 2, this.options.pusherHeight / 2, new box2d.b2Vec2(0, 0), 0);
            e = new box2d.b2FixtureDef();
            e.shape = f;
            e.friction = 0.7;
            e.restitution = 0;
            e.density = 0;
            e.isSensor = true;
            e.userData = {
              lightProperties: {
                type: "normal",
                sensor: true
              }
            };
            this.sensorFixture = g = this.body.data.CreateFixture(e);
            g.id = this.body.world.getNextFixtureId();
            i = [];
            i.push(new box2d.b2Vec2(-this.options.pusherWidth / 2 - 0.5, 0));
            i.push(new box2d.b2Vec2(this.options.pusherWidth / 2 + 0.5, 0));
            i.push(new box2d.b2Vec2(this.options.pusherWidth / 2, this.options.pusherHeight - 0.1));
            i.push(new box2d.b2Vec2(-this.options.pusherWidth / 2, this.options.pusherHeight - 0.1));
            h = new box2d.b2PolygonShape();
            h.Set(i);
            e = new box2d.b2FixtureDef();
            e.shape = h;
            e.friction = 0.7;
            e.restitution = 0;
            e.density = 0;
            e.isSensor = false;
            e.userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            this.body.data.CreateFixture(e);
            g.id = this.body.world.getNextFixtureId();
            this.signal = new Phaser.Signal();
            this.registerDevice();
            return this;
          }
          b(d, c);
          d.prototype.options = {
            pusherWidth: 1,
            pusherHeight: 0.4,
            sensorWidth: 1.5,
            atlasName: "MechAssets",
            frameName: "lightpusher_base0000",
            lightAtlas: "MechAssets",
            lightFrame: "lightpusher_light"
          };
          d.prototype.sounds = function () {
            return "lightPusher";
          };
          d.prototype.checkState = function () {
            if (this.state === 0 && this.sensorFixture.m_userData.lightProperties.iluminated === this.options.properties.color) {
              this.state = 1;
              this.game.level.sounds.lightPusher.play();
              this.signal.dispatch(this);
            } else if (this.state === 1 && this.sensorFixture.m_userData.lightProperties.iluminated !== this.options.properties.color) {
              this.state = 0;
              this.signal.dispatch(this);
            }
            return this.sensorFixture.m_userData.lightProperties.iluminated = null;
          };
          return d;
        }(c);
      });