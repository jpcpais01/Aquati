/** Old island names to new, so saves that remember an isle by name follow the rename. */
export const RENAMED_ISLES: Record<string, string> = {
  'Isla Serena': 'Ilhéu Corazinha',
  'Cayo Coralina': 'Cayo Vliemar',
  'Puerto Ámbar': "Baía d'Ambrela",
  'Cayo Esmeralda': 'Esmeraldijk',
  'Isla Vela': 'Guanaverde',
  'Bahía Turquesa': 'Punta Belleau',
  'Roca del Cuervo': 'Roca Corvão',
  'Isla Marea': 'Isla Marézia',
  'Cayo Sol': 'Cayo Solenne',
  'Isla Perla': 'Perlabana',
  'Arrecife Azul': 'Azulhoek',
  'Punta Brisa': 'Brisagüey',
  'Isla Nácar': 'Ilha Nacaréu',
  'Monte Fortuna': 'Morro Huracão',
};

/** An island name as it is now, from one a save may have kept from before the rename. */
export const currentIsle = (name: string): string => RENAMED_ISLES[name] ?? name;
