// 模块: States/Common/UIState  (init.beautified.js L39624-L39709)
      define("States/Common/UIState", ["../Common/MuteButton", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d() {
            this.layoutContent = a(this.layoutContent, this);
            this.startMusic = a(this.startMusic, this);
            this.updateMusic = a(this.updateMusic, this);
            this.decodeAudio = a(this.decodeAudio, this);
            this.preloadAudioFiles = a(this.preloadAudioFiles, this);
            this.preload = a(this.preload, this);
            this.onReady = new Phaser.Signal();
            d.__super__.constructor.apply(this, arguments);
          }
          b(d, c);
          d.prototype.preload = function () {
            this.sounds = ["menuMusic", "pusher"];
            return this.preloadAudioFiles();
          };
          d.prototype.preloadAudioFiles = function () {};
          d.prototype.decodeAudio = function (a) {
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
            this.game.currentSounds = f;
            this.game.sound.setDecodedCallback(_.map(this.sounds), function (a) {
              return function () {
                a.startMusic();
                return a.started = true;
              };
            }(this), this);
            return a();
          };
          d.prototype.updateMusic = function () {
            this.sounds.menuMusic.stop();
            if (this.game.settings.music) {
              if (this.game.menuMusic == null) {
                return this.game.menuMusic = this.sounds.menuMusic.play();
              } else {
                return this.game.menuMusic.play();
              }
            } else if (this.game.menuMusic != null) {
              return this.game.menuMusic.stop();
            } else {
              return undefined;
            }
          };
          d.prototype.startMusic = function () {
            if (this.game.settings.music && (this.game.menuMusic == null || !this.game.menuMusic.isPlaying)) {
              this.sounds.menuMusic.loop = true;
              this.sounds.menuMusic.allowMultiple = false;
              return this.game.menuMusic = this.sounds.menuMusic.play();
            }
          };
          d.prototype.create = function () {
            this.root = this.game.make.group(0, 0);
            this.game.add.existing(this.root);
            this.game.stage.backgroundColor = "#000000";
            return this.decodeAudio(function (a) {
              return function () {
                console.log("load completed");
                return a.addContent();
              };
            }(this));
          };
          d.prototype.layoutContent = function () {
            if (this.muteButton != null) {
              this.muteButton.x = this.game.realWidth / 2;
              return this.muteButton.y = -this.game.realHeight / 2;
            }
          };
          return d;
        }(Phaser.State);
      });