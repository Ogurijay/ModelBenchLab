// Shared visual dimensions and collision footprint. +Z is the nose, +Y is up.
export const VEHICLE_PROFILES = {
  ae86: { length:4.205, width:1.625, height:1.335, wheelbase:2.4, radius:.31, tire:.195, deck:.86, nose:.77, tail:.84, roofFront:.24, roofRear:-.88, glassFront:.89, glassRear:-1.86, roofWidth:.76, rim:'eight', hatch:true, panda:true, popup:true },
  ae85: { length:4.20, width:1.625, height:1.345, wheelbase:2.4, radius:.30, tire:.175, deck:.87, nose:.79, tail:.85, roofFront:.27, roofRear:-.88, glassFront:.92, glassRear:-1.85, roofWidth:.76, rim:'steel', hatch:true, panda:true },
  gtr: { length:4.545, width:1.755, height:1.34, wheelbase:2.615, radius:.335, tire:.225, deck:.91, nose:.86, tail:.91, roofFront:.25, roofRear:-.68, glassFront:1.00, glassRear:-1.35, roofWidth:.75, rim:'five', wing:1.12 },
  fc: { length:4.31, width:1.69, height:1.27, wheelbase:2.43, radius:.315, tire:.215, deck:.83, nose:.72, tail:.85, roofFront:.03, roofRear:-.91, glassFront:.79, glassRear:-1.88, roofWidth:.76, rim:'white', hatch:true, popup:true, wing:.93 },
  evo: { length:4.31, width:1.695, height:1.395, wheelbase:2.51, radius:.32, tire:.215, deck:.93, nose:.86, tail:.92, roofFront:.39, roofRear:-.76, glassFront:1.01, glassRear:-1.31, roofWidth:.77, rim:'six', doors:4, wing:1.25 },
  evo3: { length:4.31, width:1.695, height:1.395, wheelbase:2.51, radius:.33, tire:.225, deck:.93, nose:.84, tail:.92, roofFront:.39, roofRear:-.76, glassFront:1.01, glassRear:-1.31, roofWidth:.77, rim:'six', doors:4, wing:1.31 },
  benz: { length:5.12, width:1.90, height:1.49, wheelbase:3.04, radius:.35, tire:.235, deck:1.02, nose:.93, tail:.96, roofFront:.39, roofRear:-.91, glassFront:1.12, glassRear:-1.53, roofWidth:.78, rim:'luxury', doors:4, chrome:true },
  wuling: { length:4.395, width:1.66, height:1.75, wheelbase:2.72, radius:.295, tire:.185, deck:1.04, nose:.93, tail:1.04, roofFront:1.03, roofRear:-1.83, glassFront:1.64, glassRear:-2.09, roofWidth:.88, rim:'steel', doors:4, van:true }
};
