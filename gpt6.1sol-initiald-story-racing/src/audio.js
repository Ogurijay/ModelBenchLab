export class Audio {
  constructor(){this.enabled=false;this.nextBeat=0;this.beat=0;this.mode='silent';}
  async toggle(){
    if(!this.ctx){
      this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=.17;this.master.connect(this.ctx.destination);
      this.engine=this.ctx.createOscillator();this.engine.type='sawtooth';this.engineGain=this.ctx.createGain();this.engineGain.gain.value=0;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;this.engine.connect(filter);filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate),samples=buffer.getChannelData(0);let seed=47;for(let i=0;i<samples.length;i++){seed=(seed*1664525+1013904223)>>>0;samples[i]=(seed/4294967296*2-1)*.5;}
      this.sea=this.ctx.createBufferSource();this.sea.buffer=buffer;this.sea.loop=true;const seaFilter=this.ctx.createBiquadFilter();seaFilter.type='lowpass';seaFilter.frequency.value=650;this.seaGain=this.ctx.createGain();this.seaGain.gain.value=0;this.sea.connect(seaFilter);seaFilter.connect(this.seaGain);this.seaGain.connect(this.master);this.sea.start();
      this.tires=this.ctx.createBufferSource();this.tires.buffer=buffer;this.tires.loop=true;
      const tireFilter=this.ctx.createBiquadFilter();tireFilter.type='bandpass';tireFilter.frequency.value=1600;tireFilter.Q.value=.7;
      this.tireTone=this.ctx.createOscillator();this.tireTone.type='triangle';this.tireTone.frequency.value=700;
      this.tireGain=this.ctx.createGain();this.tireGain.gain.value=0;this.tires.connect(tireFilter);this.tireTone.connect(tireFilter);tireFilter.connect(this.tireGain);this.tireGain.connect(this.master);this.tires.start();this.tireTone.start();
    }
    this.enabled=!this.enabled;
    if(this.enabled)await this.ctx.resume();else await this.ctx.suspend();return this.enabled;
  }
  note(midi,duration=.14,type='triangle',volume=.08){
    if(!this.enabled)return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;o.type=type;o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration);
  }
  update(speed,mode,combo=0,rank=1,drift=0){
    if(!this.enabled)return;
    const t=this.ctx.currentTime;this.engine.frequency.setTargetAtTime(38+speed*3.4,t,.08);this.engineGain.gain.setTargetAtTime(mode==='race'||mode==='engine'?.2:0,t,.12);
    this.tireTone.frequency.setTargetAtTime(650+speed*9,t,.08);this.tireGain.gain.setTargetAtTime(mode==='race'?Math.min(1,drift)*.085:0,t,.08);
    this.seaGain.gain.setTargetAtTime(mode==='beach'?.12+Math.sin(t*.5)*.03:mode==='rain'?.065:0,t,.3);
    if(mode!==this.mode){this.mode=mode;this.nextBeat=t+.2;}
    if(t<this.nextBeat)return;
    if(mode==='race'){
      const melody=[76,79,83,79,74,78,81,78,72,76,79,76,74,78,81,86];
      this.note(melody[this.beat%16],.18,'sawtooth',.033);if(this.beat%2===0)this.note([40,38,36,38][Math.floor(this.beat/4)%4],.15,'square',.075);if(this.beat%4===0)this.note(25,.1,'sine',.45);
      this.nextBeat=t+60/(150+Math.min(combo*3,18)+(rank===1?4:0))/2;
    } else if(mode==='piano'){this.note([64,67,71,74,62,66,69,73][this.beat%8],1.2,'sine',.08);this.nextBeat=t+.6;}
    else this.nextBeat=t+.3;
    this.beat++;
  }
}
