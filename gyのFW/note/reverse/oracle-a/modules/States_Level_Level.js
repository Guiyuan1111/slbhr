// 模块: States/Level/Level  (init.beautified.js L65121-L66122)
      define("States/Level/Level", ["require", "box2d", "States/Level/Devices/_define", "hammer", "outlineFilter", "inlineFilter", "shadowFilter", "bevelFilter", "colorMatrix", "./Ground", "./character", "./MechManager", "./CameraManager", "./PauseMenu", "./CursorToggle", "./LevelUI", "States/End", "../Common/Navies"], function (c) {
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
        c("box2d");
        c("States/Level/Devices/_define");
        c("hammer");
        c("outlineFilter");
        c("inlineFilter");
        c("shadowFilter");
        c("bevelFilter");
        c("colorMatrix");
        h = c("./Ground");
        e = c("./character");
        k = c("./MechManager");
        d = c("./CameraManager");
        m = c("./PauseMenu");
        f = c("./CursorToggle");
        j = c("./LevelUI");
        g = c("States/End");
        l = c("../Common/Navies");
        return i = i = function (c) {
          function i() {
            this.quit = a(this.quit, this);
            this.gameOver = a(this.gameOver, this);
            this.retry = a(this.retry, this);
            this.updateDust = a(this.updateDust, this);
            this.updateTutorial = a(this.updateTutorial, this);
            this.update = a(this.update, this);
            this.gameFinish = a(this.gameFinish, this);
            this.animateFinish = a(this.animateFinish, this);
            this.checkEndGame = a(this.checkEndGame, this);
            this.updateMusic = a(this.updateMusic, this);
            this.setupCursorToggle = a(this.setupCursorToggle, this);
            this.onSettingChange = a(this.onSettingChange, this);
            this.createCharObjects = a(this.createCharObjects, this);
            this.createObjects = a(this.createObjects, this);
            this.fillDustLayer = a(this.fillDustLayer, this);
            this.updateDarkness = a(this.updateDarkness, this);
            this.setupDarkness = a(this.setupDarkness, this);
            this.setupLayers = a(this.setupLayers, this);
            this.pauseUpdate = a(this.pauseUpdate, this);
            this.togglePause = a(this.togglePause, this);
            this.startLevel = a(this.startLevel, this);
            this.start = a(this.start, this);
            this.layoutContent = a(this.layoutContent, this);
            this.loadComplete = a(this.loadComplete, this);
            this.setupTutorial = a(this.setupTutorial, this);
            this.parseMapPropper = a(this.parseMapPropper, this);
            this.killAll = a(this.killAll, this);
            this.shutdown = a(this.shutdown, this);
            this.decodeAudio = a(this.decodeAudio, this);
            this.preloadAudioFiles = a(this.preloadAudioFiles, this);
            this.baseLoadComplete = a(this.baseLoadComplete, this);
            this.create = a(this.create, this);
            this.init = a(this.init, this);
            this.onReady = new Phaser.Signal();
            i.__super__.constructor.call(this);
          }
          b(i, c);
          i.prototype.useDust = true;
          i.prototype.init = function (a) {
            this.levelPath = "data/" + a.filename;
            this.levelData = a;
            this.levelState = {
              diamonds: {
                red: 0,
                blue: 0,
                silver: 0
              },
              time: Infinity
            };
            this.game.time.advancedTiming = true;
            return this.game.sound.mute = !this.game.settings.fx;
          };
          i.prototype.create = function () {
            this.game.load.tilemap("map", this.levelPath, null, Phaser.Tilemap.TILED_JSON);
            this.game.load.onLoadComplete.addOnce(this.baseLoadComplete, this);
            this.game.load.start();
          };
          i.prototype.baseLoadComplete = function () {
            _.defer(function (a) {
              return function () {
                var b;
                a.mapData = a.parseMapPropper();
                b = "assets/atlasses/Temples/" + a.game.currentTemple.id;
                a.game.load.atlasJSONArray("TempleAssets", b + "/TempleAssets.png", b + "/TempleAssets.json");
                a.preloadAudioFiles();
                a.game.load.onLoadComplete.addOnce(a.loadComplete, a);
                return a.game.load.start();
              };
            }(this));
          };
          i.prototype.preloadAudioFiles = function () {
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
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            var r;
            if (this.levelData.type === "dark") {
              h = "levelMusic_dark";
              j = "levelMusicOver";
              i = "levelMusicFinish";
            } else if (this.levelData.type === "speed") {
              h = "levelMusic_speed";
              j = "levelMusicOver";
              i = "levelMusicFinish_speed";
            } else {
              h = "levelMusic";
              j = "levelMusicOver";
              i = "levelMusicFinish";
            }
            r = {
              levelMusic: h,
              levelMusicOver: j,
              levelMusicFinish: i
            };
            this.sounds = [];
            this.sounds = this.sounds.concat(["levelMusic", "levelMusicOver", "levelMusicFinish", "charToggle1", "charToggle2", "endPass", "endFail", "endDiamond", "jump_fb", "jump_wg", "waterSteps", "iceSteps_fb", "iceSteps_wg", "death", "diamond", "door", "freeze", "melt"]);
            m = this.mapData.objects.Objects;
            d = 0;
            f = m.length;
            for (; d < f; d++) {
              l = m[d];
              a = k.className(l.type);
              if (a != null) {
                b = a.prototype.sounds != null && a.prototype.sounds() || [];
                if (!Array.isArray(b)) {
                  q = [b];
                }
                this.sounds = this.sounds.concat(b);
              } else {
                console.warn("Object type " + l.type + " not found!");
              }
            }
            this.sounds = _.uniq(this.sounds);
            n = this.sounds;
            o = [];
            e = 0;
            g = n.length;
            for (; e < g; e++) {
              p = n[e];
              c = (r[p] || p).charAt(0).toUpperCase() + (r[p] || p).slice(1);
              o.push(this.game.load.audio(p, "assets/audio/" + c + ".mp3"));
            }
            return o;
          };
          i.prototype.decodeAudio = function (a) {
            var b;
            var c;
            var d;
            var e;
            var f;
            f = {};
            d = this.sounds;
            b = 0;
            c = d.length;
            for (; b < c; b++) {
              e = d[b];
              f[e] = this.game.add.audio(e);
            }
            this.sounds = f;
            this.game.sound.setDecodedCallback(_.map(this.sounds), function (a) {
              return function () {
                if (a.game.settings.music) {
                  a.sounds.levelMusic.loop = true;
                  return a.sounds.levelMusic.play();
                }
              };
            }(this), this);
            return a();
          };
          i.prototype.shutdown = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            this.pers1.destroy(true);
            this.pers2.destroy(true);
            this.door1.destroy(true);
            this.door2.destroy(true);
            this.camManager.destroy();
            if (this.darknessBmd != null) {
              this.darkness.events.onRemovedFromGroup.add(function (a) {
                return function () {
                  return a.darknessBmd.destroy();
                };
              }(this));
            }
            _.each(this.objects, function (a) {
              return a.destroy(true);
            });
            _.each(this.game.layers, function (a) {
              return a.update = function (a) {
                return function () {};
              }(this);
            });
            this.game.settingsSignal.remove(this.onSettingChange);
            if (this.cursorToggle != null) {
              this.game.TouchManager.unregister(this.pers1.bodySprite, "tap");
              this.game.TouchManager.unregister(this.pers2.bodySprite, "tap");
            }
            if (this.navies != null) {
              d = this.navies;
              e = [];
              a = 0;
              b = d.length;
              for (; a < b; a++) {
                c = d[a];
                e.push(c.destroy(true));
              }
              return e;
            }
          };
          i.prototype.killAll = function () {
            if (this.game != null) {
              this.game.physics.box2d.paused = true;
              this.game.paused = true;
              this.ui.clock.destroy(true);
              this.ui.destroy(true);
              return _.each(this.sounds, function (a) {
                return function (a) {
                  return a.destroy();
                };
              }(this));
            }
          };
          i.prototype.parseMapPropper = function () {
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
            g = this.game.cache.getTilemapData("map").data;
            a = [];
            i = [];
            l = g.tilesets;
            b = 0;
            d = l.length;
            for (; b < d; b++) {
              p = l[b];
              if (p.source != null) {
                p.src = p.source;
                h = p.src.split("/").pop().replace(".json", "");
                delete p.source;
                if (h === "Ground") {
                  a.push(p);
                } else {
                  i.push(p);
                }
              }
            }
            g.tilesets = a;
            m = g.tilesets;
            c = 0;
            e = m.length;
            for (; c < e; c++) {
              p = m[c];
              if (p.src != null) {
                h = p.src.split("/").pop().replace(".json", "");
                if (h === "Ground") {
                  _.extend(p, this.game.cache.getJSON(h));
                }
              }
            }
            q = Phaser.TilemapParser.parseTiledJSON(g);
            g.tilesets = a.concat(i);
            n = g.tilesets;
            k = 0;
            f = n.length;
            for (; k < f; k++) {
              p = n[k];
              if (p.src != null) {
                h = p.src.split("/").pop().replace(".json", "");
                if (h !== "Ground") {
                  q.tilesets.push(_.extend(p, this.game.cache.getJSON(h)));
                }
              }
            }
            j = function (a) {
              return function () {
                var a;
                var b;
                var c;
                var d;
                var e;
                var f;
                var g;
                g = {};
                e = q.tilesets;
                d = 0;
                b = e.length;
                for (; d < b; d++) {
                  f = e[d];
                  if (f.tiles != null) {
                    for (a in f.tiles) {
                      c = f.tileproperties[a];
                      g[+f.firstgid + +a] = {
                        type: f.tiles[a].type,
                        properties: c
                      };
                    }
                  }
                }
                return g;
              };
            }(this);
            r = j();
            o = function (a) {
              return function (a) {
                var b;
                var c;
                var d;
                var e;
                e = [];
                d = 0;
                b = a.length;
                for (; d < b; d++) {
                  c = a[d];
                  if (c.gid != null && r[+c.gid] != null) {
                    if (c.type === "") {
                      delete c.type;
                    }
                    e.push(_.deepObjectExtend(c, r[+c.gid]));
                  } else {
                    e.push(undefined);
                  }
                }
                return e;
              };
            }(this);
            o(q.objects.Objects);
            o(q.objects.Chars);
            return q;
          };
          i.prototype.setupTutorial = function () {
            var c;
            var d;
            var e;
            var f;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            f = this.game.cache.getTilemapData("map").data;
            if ((o = _.findWhere(f.layers, {
              name: "Tutorial_" + this.game.settings.controls
            }) || _.findWhere(f.layers, {
              name: "Tutorial"
            })) != null) {
              n = {};
              i = o.objects;
              c = 0;
              e = i.length;
              for (; c < e; c++) {
                h = i[c];
                n[h.properties.id] ||= {};
                if (h.text != null) {
                  n[h.properties.id].texts ||= [];
                  n[h.properties.id].texts.push(h);
                } else {
                  n[h.properties.id].rects ||= [];
                  n[h.properties.id].rects.push(new Phaser.Rectangle(h.x, h.y, h.width, h.height));
                }
              }
              this.tutorialTexts = [];
              j = [];
              for (d in n) {
                l = n[d];
                console.log("text object", l);
                j.push(function () {
                  var a;
                  var b;
                  var c;
                  var d;
                  c = l.texts;
                  d = [];
                  a = 0;
                  b = c.length;
                  for (; a < b; a++) {
                    k = c[a];
                    m = this.game.make.bitmapText(k.x, k.y, "font", k.text.text, 18, k.text.halign);
                    m.maxWidth = k.width;
                    m.cacheAsBitmap = true;
                    m.visible = false;
                    m.rects = l.rects;
                    this.game.layers.tutorial.addChild(m);
                    d.push(this.tutorialTexts.push(m));
                  }
                  return d;
                }.call(this));
              }
              return j;
            }
          };
          i.prototype.loadComplete = function () {
            var a;
            var b;
            var c;
            var e;
            var f;
            var g;
            var i;
            this.loadCompleted = true;
            this.game.clearBeforeRender = false;
            this.game.level = this;
            this.setupLayers();
            a = $("<div style=\"top:0; left: 0; width: 100%; height: 100%; position:absolute\"></div>");
            if (this.game.config.enableDebug) {
              $(window).on("keydown", function (a) {
                return function (b) {
                  if (b.keyCode === 81) {
                    return a.debug = !a.debug;
                  }
                };
              }(this));
            }
            this.showfps = this.game.config.showFps;
            this.game.MechManager = new k(this.game);
            this.game.physics.startSystem(Phaser.Physics.BOX2D);
            this.game.physics.box2d.setPTMRatio(32);
            this.game.physics.setBoundsToWorld = function (a) {
              return function () {};
            }(this);
            b = new h(this.game, this.mapData);
            this.ground = b;
            this.size = {
              width: b.options.width,
              height: b.options.height
            };
            this.game.physics.box2d.gravity.y = 1000;
            this.objects = this.createObjects(this.map, this.mapData.objects.Objects);
            this.createCharObjects(this.map, this.mapData.objects.Chars);
            if (this.useDust) {
              i = b.getNaviesPoints();
              this.navies = [];
              c = 0;
              e = i.length;
              for (; c < e; c++) {
                g = i[c];
                f = new l(this.game, g.x, g.y, Math.floor(1 + Math.random() * 3));
                f.scale.set(0.3 + Math.random() * 0.7);
                this.game.layers.overGround.addChild(f);
                this.navies.push(f);
              }
            }
            if (this.useDust && _.find(this.objects, function (a) {
              return a.options.type === "beamer";
            }) != null) {
              this.fillDustLayer();
            }
            b.decorate(this.objects);
            this.setupDarkness();
            this.setupTutorial();
            this.pauseMenu = new m(this.game, this);
            this.pauseKey = this.game.input.keyboard.addKey(Phaser.Keyboard.P);
            this.pauseKey.onDown.add(this.togglePause);
            this.ui = new j(this.game, this);
            this.camManager = new d(this);
            this.root.alpha = 0;
            requestAnimationFrame(function (a) {
              return function () {
                a.game.stage.backgroundColor = 0;
                a.onReady.dispatch();
                a.root.alpha = 1;
                a.game.layers.ui.alpha = 1;
                a.ui.show();
                if (a.cursorToggle != null) {
                  return a.cursorToggle.init();
                }
              };
            }(this));
            this.game.physics.box2d.useElapsedTime = true;
            this.game.physics.box2d.paused = true;
            this.game.physics.box2d.update = function () {
              var a;
              if (!this.paused) {
                a = Math.min(0.04, this.game.time.elapsed / 1000);
                return this.world.Step(a, this.velocityIterations, this.positionIterations);
              }
            };
            this.decodeAudio(function (a) {
              return function () {
                console.log("load completed");
                return a.startLevel();
              };
            }(this));
          };
          i.prototype.layoutContent = function () {
            this.ui.layoutContent();
            this.pauseMenu.layoutContent();
            if (this.cursorToggle != null) {
              this.cursorToggle.layoutContent();
            }
            if (this.pers1.cursors.layoutContent != null) {
              this.pers1.cursors.layoutContent();
            }
            if (this.pers2.cursors.layoutContent != null) {
              return this.pers2.cursors.layoutContent();
            }
          };
          i.prototype.start = function () {};
          i.prototype.startLevel = function () {
            var a;
            var b;
            this.game.time.addvancedTiming = true;
            _.delay(function (a) {
              return function () {
                if (a.game.time.suggestedFps < 40) {
                  a.useDust = false;
                  _.each(a.navies, function (a) {
                    return a.destroy();
                  });
                  return a.game.layers.dust.destroy();
                }
              };
            }(this), 3000);
            this.levelStarted = true;
            this.game.MechManager.resetStates();
            this.game.physics.box2d.paused = false;
            this.game.forceSingleUpdate = false;
            a = b = 0;
            for (; b <= 3; a = ++b) {
              this.game.updateLogic(this.game.time.desiredFpsMult);
            }
            this.game.updateRender(this.game.time.slowMotion * this.game.time.desiredFps);
            this.game.forceSingleUpdate = true;
            this.game.physics.box2d.paused = true;
            console.log("start timer, and whatever");
            return _.delay(function (a) {
              return function () {
                a.camManager.camFreeze = false;
                return _.delay(function () {
                  if (a.game.physics.box2d != null) {
                    a.ui.clock.start();
                    return a.game.physics.box2d.paused = false;
                  }
                }, 400);
              };
            }(this), 1600);
          };
          i.prototype.togglePause = function () {
            this.game.paused = !this.game.paused;
            if (this.game.paused) {
              this.root.alpha.cacheAsBitmap = true;
              this.pauseMenu.show();
              return this.ui.clock.pause();
            } else {
              this.root.alpha.cacheAsBitmap = false;
              this.root.alpha = 1;
              this.pauseMenu.hide();
              return this.ui.clock.resume();
            }
          };
          i.prototype.pauseUpdate = function () {
            if (this.loadCompleted) {
              this.pauseMenu.update();
              if (this.pauseMenu.settingsMenu != null) {
                this.pauseMenu.settingsMenu.update();
              }
              this.game.tweens.update();
              return this.camManager.update();
            }
          };
          i.prototype.setupLayers = function () {
            var a;
            var b;
            b = {};
            this.root = this.game.make.group(0, 0);
            a = function (a) {
              return function (c) {
                b[c] = a.game.make.group();
                b[c].name = c;
                return a.root.addChild(b[c]);
              };
            }(this);
            a("background");
            a("tutorial");
            a("underGround");
            a("lights");
            a("ground");
            a("overGround");
            a("chars");
            a("overChars");
            a("decorations");
            a("liquids");
            b.liquids.update = function () {
              return _.each(this.children, function (a) {
                return a.update();
              });
            };
            this.game.add.existing(this.root);
            b.ui = this.game.make.group();
            b.ui.alpha = 0;
            this.game.add.existing(b.ui);
            b.ui.update = function () {
              return _.each(this.children, function (a) {
                return a.update();
              });
            };
            b.dust = this.game.make.group();
            b.dust.sources = [];
            this.root.addChild(b.dust);
            return this.game.layers = b;
          };
          i.prototype.setupDarkness = function () {
            var a;
            var b;
            if (this.levelData.type != null && this.levelData.type === "dark") {
              this.darknessBmd = a = this.game.add.bitmapData(this.size.width + 64, this.size.height + 64);
              a.offset = {
                x: 32,
                y: 32
              };
              this.darkness = b = this.game.make.sprite(-32, -32, a);
              b.blendMode = Phaser.blendModes.MULTIPLY;
              this.game.layers.darkGradients = this.game.make.group(0, 0);
              this.root.addChild(this.game.layers.darkGradients);
              this.root.addChild(b);
              this.updateDarkness(a);
              return this.game.layers.darkGradients.update = function (b) {
                return function () {
                  if (b.game.physics != null) {
                    return b.updateDarkness(a);
                  }
                };
              }(this);
            }
          };
          i.prototype.updateDarkness = function (a) {
            var b;
            var c;
            var d;
            var e;
            a.ctx.globalCompositeOperation = "source-over";
            a.ctx.beginPath();
            a.ctx.rect(0, 0, this.size.width + 64, this.size.height + 64);
            a.ctx.fillStyle = "#000000";
            a.ctx.fill();
            this.pers1.drawDarkMask(a);
            this.pers2.drawDarkMask(a);
            e = this.objects;
            b = 0;
            c = e.length;
            for (; b < c; b++) {
              d = e[b];
              if (d.drawDarkMask != null) {
                d.drawDarkMask(a);
              }
            }
            return a.dirty = true;
          };
          i.prototype.fillDustLayer = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            e = this.game.layers.dust;
            a = b = 0;
            c = Math.ceil(this.size.width / 10);
            for (; c >= 0 ? b <= c : b >= c; a = c >= 0 ? ++b : --b) {
              d = this.game.make.sprite(Math.random() * this.size.width, Math.random() * this.size.height, "GroundAssets", "BeamDust0000");
              d.rotation = Math.random() * 180;
              e.add(d);
            }
            e.maskGraphics = this.game.make.graphics(0, 0);
            this.root.addChild(e.maskGraphics);
            e.mask = e.maskGraphics;
            return e;
          };
          i.prototype.createObjects = function (a, b) {
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            e = [];
            f = 0;
            g = b.length;
            for (; f < g; f++) {
              h = b[f];
              console.log("create", h.name, h.type);
              c = k.className(h.type);
              if (c != null) {
                d = new c(this.game, h);
                e.push(d);
              } else {
                console.warn("Object type " + h.type + " not found!");
              }
            }
            this.game.MechManager.connectPortals();
            return e;
          };
          i.prototype.createCharObjects = function (a, b) {
            var c;
            var d;
            var f;
            this.totalDiamonds = 0;
            c = 0;
            d = b.length;
            for (; c < d; c++) {
              f = b[c];
              console.log("found char object", f.type);
              if (f.type === "char") {
                if (f.properties == null || f.properties.char === "fb") {
                  this.pers1 = new e(this.game, f.x, f.y, "fb");
                  this.pers1.signal.add(this.checkEndGame);
                } else if (f.properties.char === "wg") {
                  this.pers2 = new e(this.game, f.x, f.y, "wg");
                  this.pers2.signal.add(this.checkEndGame);
                }
              }
              if (f.type === "door") {
                if (f.properties == null || f.properties.char === "fb") {
                  this.door1 = new Devices.Door(this.game, f.x, f.y, "fb");
                  this.door1.signal.add(this.checkEndGame);
                } else if (f.properties.char === "wg") {
                  this.door2 = new Devices.Door(this.game, f.x, f.y, "wg");
                  this.door2.signal.add(this.checkEndGame);
                }
              }
              if (f.type === "diamond") {
                new Devices.Diamond(this.game, f.x, f.y, f.properties.char);
                if (f.properties.char !== "silver") {
                  this.totalDiamonds++;
                }
              }
            }
            this.setupCursorToggle();
            return this.game.settingsSignal.add(this.onSettingChange);
          };
          i.prototype.onSettingChange = function (a) {
            if (a === "controls") {
              if (this.cursorToggle != null) {
                this.cursorToggle.destroy();
                this.cursorToggle = null;
              }
              return this.setupCursorToggle();
            }
          };
          i.prototype.setupCursorToggle = function () {
            if (this.game.settings.controls === "single") {
              this.game.TouchManager.register(this.pers1.bodySprite, "tap", function (a) {
                return function (b) {
                  return a.cursorToggle.setChar("fb", b);
                };
              }(this));
              this.game.TouchManager.register(this.pers2.bodySprite, "tap", function (a) {
                return function (b) {
                  return a.cursorToggle.setChar("wg", b);
                };
              }(this));
              this.cursorToggle = new f(this.game);
              this.game.layers.ui.addChild(this.cursorToggle);
              return this.cursorToggle.onChange.add(function (a) {
                return function (b) {
                  if (b === "fb") {
                    a.pers1.cursors.show();
                    return a.pers2.cursors.hide();
                  } else {
                    a.pers1.cursors.hide();
                    return a.pers2.cursors.show();
                  }
                };
              }(this));
            }
          };
          i.prototype.updateMusic = function () {
            if (this.sounds.levelMusic != null) {
              this.sounds.levelMusic.stop();
            }
            if (this.game.settings.music) {
              return this.sounds.levelMusic.play();
            }
          };
          i.prototype.checkEndGame = function () {
            if (!this.ended) {
              if (this.door1.isUp && this.door2.isUp) {
                this.ended = true;
                this.game.physics.box2d.paused = true;
                this.animateFinish();
              }
              if (this.pers1.isDead || this.pers2.isDead) {
                this.ended = true;
                this.game.physics.box2d.paused = true;
                return this.gameOver();
              } else {
                return undefined;
              }
            }
          };
          i.prototype.animateFinish = function () {
            this.game.level.sounds.levelMusic.stop();
            this.game.level.sounds.levelMusicFinish.play();
            this.pers1.animateStairs(this.door1);
            this.pers2.animateStairs(this.door2);
            return _.delay(function (a) {
              return function () {
                return a.gameFinish();
              };
            }(this), 1600);
          };
          i.prototype.gameFinish = function () {
            this.levelState.diamonds = this.pers1.data.diamonds + this.pers2.data.diamonds;
            this.levelState.silverDiamond = this.pers1.data.silverDiamond + this.pers2.data.silverDiamond;
            this.levelState.time = this.ui.clock.getElapsedSeconds();
            this.ui.clock.stop();
            this.levelData.totalDiamonds = this.totalDiamonds;
            this.game.state.add("endGame", g);
            return this.game.state.start("endGame", false, false, {
              success: true,
              data: this.levelData,
              state: this.levelState
            });
          };
          i.prototype.update = function () {
            if (this.loadCompleted) {
              if (this.showfps) {
                $("#debug-fps").html(this.game.time.fps);
              }
              if (this.debug) {
                this.game.debug.box2dWorld();
              }
              this.ui.update();
              if (this.useDust) {
                this.updateDust();
              }
              if (this.tutorialTexts != null) {
                this.updateTutorial();
              }
              return this.camManager.update();
            }
          };
          i.prototype.updateTutorial = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            d = this.tutorialTexts;
            e = [];
            a = 0;
            b = d.length;
            for (; a < b; a++) {
              g = d[a];
              e.push(function () {
                var a;
                var b;
                var d;
                var e;
                d = g.rects;
                e = [];
                a = 0;
                b = d.length;
                for (; a < b; a++) {
                  c = d[a];
                  if (c.contains(this.pers1.sprite.x, this.pers1.sprite.y) || c.contains(this.pers2.sprite.x, this.pers2.sprite.y)) {
                    if (!g.shown) {
                      g.shown = true;
                      g.visible = true;
                      g.alpha = 0;
                      this.game.add.tween(g).to({
                        alpha: 1
                      }, 400, "Linear", true);
                      break;
                    }
                    e.push(undefined);
                  } else {
                    if (g.shown) {
                      g.shown = false;
                      f = this.game.add.tween(g).to({
                        alpha: 0
                      }, 400, "Linear", true);
                      break;
                    }
                    e.push(undefined);
                  }
                }
                return e;
              }.call(this));
            }
            return e;
          };
          i.prototype.updateDust = function () {
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
            if (this.game.layers.dust != null && this.game.layers.dust.sources.length > 0) {
              i = false;
              j = this.game.layers.dust.sources;
              c = 0;
              e = j.length;
              for (; c < e; c++) {
                o = j[c];
                if (o.dirty) {
                  i = true;
                }
              }
              if (i) {
                this.game.layers.dust.maskGraphics.clear();
                this.game.layers.dust.maskGraphics.lineStyle(40, 0, 1);
                a = true;
                k = this.game.layers.dust.sources;
                d = 0;
                f = k.length;
                for (; d < f; d++) {
                  o = k[d];
                  if (o.points != null && o.points.length > 0) {
                    a = false;
                    o.drawBeam(this.game.layers.dust.maskGraphics, o.points);
                  }
                }
                this.game.layers.dust.visible = !a;
              }
              l = this.game.layers.dust.children;
              m = [];
              b = h = 0;
              g = l.length;
              for (; h < g; b = ++h) {
                n = l[b];
                n.angle += (b % 2 * 2 - 1) * 0.002;
                m.push(n.anchor.set(Math.sin(n.angle), Math.cos(n.angle)));
              }
              return m;
            }
          };
          i.prototype.retry = function () {
            this.game.level.sounds.levelMusic.stop();
            this.game.state.add("level", i);
            this.game.state.fade("level", true, false, this.levelData);
            return this.killAll();
          };
          i.prototype.gameOver = function () {
            this.ui.clock.stop();
            this.game.state.add("endGame", g);
            return this.game.state.start("endGame", false, false, {
              success: false,
              data: this.levelData,
              state: this.levelState
            });
          };
          i.prototype.quit = function () {
            this.game.level.sounds.levelMusic.stop();
            this.game.state.fade("levelMenu", true, false, this.game.currentTemple);
            return this.killAll();
          };
          return i;
        }(Phaser.State);
      });