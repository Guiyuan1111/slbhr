// 模块: States/Level/Devices/Pusher  (init.beautified.js L58512-L58610)
      define("States/Level/Devices/Pusher", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.ocupy = a(this.ocupy, this);
            this.checkState = a(this.checkState, this);
            this.doRegister = a(this.doRegister, this);
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
            var o;
            d.__super__.constructor.call(this, b, c);
            g = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "_default0000");
            this.game.physics.box2d.enable(g);
            h = this.game.make.resSprite(0, 0, "MechAssets", "pusher_block0000");
            h.anchor.set(0.5);
            g.addChild(h);
            j = this.game.make.resSprite(0, 0, "MechAssets", "pusher_block_light0000");
            j.anchor.set(0.5);
            g.addChild(j);
            this.button = g;
            this.game.layers.underGround.addChild(g);
            this.base = f = this.game.make.sprite(this.options.x, this.options.y + this.mpx(0.5), "MechAssets", "_default0000");
            this.game.layers.overGround.addChild(f);
            this.lights.push(j);
            g.body.clearFixtures();
            g.body.data.SetAngle(Math.PI * c.rotation / 180 || 0);
            i = g.body;
            o = [];
            o.push(new box2d.b2Vec2(-this.options.pusherWidth / 2 - 0.5, 0));
            o.push(new box2d.b2Vec2(this.options.pusherWidth / 2 + 0.5, 0));
            o.push(new box2d.b2Vec2(this.options.pusherWidth / 2, this.options.pusherHeight));
            o.push(new box2d.b2Vec2(-this.options.pusherWidth / 2, this.options.pusherHeight));
            n = new box2d.b2PolygonShape();
            n.Set(o);
            k = new box2d.b2FixtureDef();
            k.shape = n;
            k.friction = 0.7;
            k.restitution = 0;
            k.density = 0.1;
            k.userData = "pusher";
            k.filter.categoryBits = 1;
            k.filter.maskBits = 61695;
            m = i.data.CreateFixture(k);
            m.id = i.world.getNextFixtureId();
            e = new box2d.b2Vec2(0, 1);
            l = new box2d.b2PrismaticJointDef();
            l.Initialize(i.data, this.game.level.groundBody, i.data.GetWorldCenter(), e);
            l.upperTranslation = 0.7;
            l.lowerTranslation = 0;
            l.enableLimit = true;
            l.motorSpeed = -15;
            l.maxMotorForce = 5;
            l.enableMotor = true;
            this.joint = this.game.physics.box2d.world.CreateJoint(l);
            this.signal = new Phaser.Signal();
            this.doRegister();
            return this;
          }
          b(d, c);
          d.prototype.options = {
            pusherWidth: 1,
            pusherHeight: 0.6,
            atlasName: null,
            frameName: null
          };
          d.prototype.sounds = function () {
            return "pusher";
          };
          d.prototype.doRegister = function () {
            return this.registerDevice();
          };
          d.prototype.checkState = function () {
            if (this.state === 0 && this.joint.GetJointTranslation() > 0.2) {
              this.state = 1;
              this.game.level.sounds.pusher.play();
              return this.signal.dispatch(this);
            } else if (this.state === 1 && this.joint.GetJointTranslation() <= 0.2) {
              this.state = 0;
              this.game.level.sounds.pusher.play();
              return this.signal.dispatch(this);
            } else {
              return undefined;
            }
          };
          d.prototype.ocupy = function () {};
          return d;
        }(c);
      });