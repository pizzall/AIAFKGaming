"""Build the Gen9 TM index from the existing local PokeAPI snapshot."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data' / 'raw' / 'pokeapi'


def rows(name):
    with (SOURCE / f'{name}.csv').open(encoding='utf-8', newline='') as source:
        return list(csv.DictReader(source))


def main():
    moves = {row['id']: row['identifier'] for row in rows('moves')}
    machines = {}
    for row in rows('machines'):
        version, number = int(row['version_group_id']), int(row['machine_number'])
        if version not in (25, 26, 27) or number == 0:
            continue
        if number in machines and machines[number]['sourceVersionGroup'] > version:
            continue
        machines[number] = {
            'number': number, 'resource': f'tm9_{number:03}', 'itemId': int(row['item_id']),
            'moveId': int(row['move_id']), 'move': moves[row['move_id']].replace('-', ''),
            'sourceVersionGroup': version,
        }
    result = {'generation': 9, 'versionGroups': [25, 26, 27], 'machines': [machines[n] for n in sorted(machines)]}
    destination = ROOT / 'data' / 'derived' / 'machines-gen9.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(machines)} Gen9 machines to {destination}')


if __name__ == '__main__':
    main()
