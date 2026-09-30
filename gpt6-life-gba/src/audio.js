// A tiny original pentatonic music box. Audio is opt-in, synthesized entirely offline.
export class Music {
  constructor(){this.enabled=false;this.context=null;this.timer=null;this.step=0;}
  async toggle(){
    if(!this.context){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return false;this.context=new AudioContext();}
    await this.context.resume();this.enabled=!this.enabled;
    if(this.enabled){this.tick();this.timer=setInterval(()=>this.tick(),280);}else{clearInterval(this.timer);this.timer=null;}
    return this.enabled;
  }
  tone(freq,duration=.22,type='triangle',volume=.026){
    if(!this.enabled||!this.context||this.context.state!=='running')return;
    const t=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.context.destination);o.start(t);o.stop(t+duration+.02);
  }
  tick(){
    if(document.hidden)return;
    const notes=[72,76,79,0,81,79,76,0,74,76,79,76,72,0,67,0,69,72,76,0,79,76,72,0,67,69,72,74,72,0,0,0];
    const note=notes[this.step%notes.length];if(note)this.tone(440*2**((note-69)/12),.45,'triangle',.023);
    if(this.step%8===0)this.tone(440*2**(([48,53,57,55][Math.floor(this.step/8)%4]-69)/12),1.4,'sine',.032);
    this.step++;
  }
  success(){[523,659,784].forEach((f,i)=>setTimeout(()=>this.tone(f,.25,'triangle',.05),i*90));}
  click(){this.tone(659,.09,'triangle',.035);}
}
