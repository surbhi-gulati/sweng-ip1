import { mock, mockClear } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { readFileSync } from 'fs';
import Player from '../lib/Player';
import { getLastEmittedEvent } from '../TestUtils';
import { TownEmitter } from '../types/CoveyTownSocket';
import PosterSessionArea from './PosterSessionArea';

describe('PosterSessionArea', () => {
  const box = { x: 100, y: 100, width: 100, height: 100 };
  let area: PosterSessionArea;
  const emitter = mock<TownEmitter>();
  let player: Player;
  const id = nanoid();
  const stars = 1;
  const title = 'Test Poster';
  const imageContents = readFileSync('./testData/poster.jpg', 'utf-8');

  beforeEach(() => {
    mockClear(emitter);
    area = new PosterSessionArea({ id, stars, title, imageContents }, box, emitter);
    player = new Player(nanoid(), mock<TownEmitter>());
    area.add(player);
  });

  describe('remove', () => {
    it('Removes the player from the list of occupants and emits an interactableUpdate event', () => {
      // Add another player so that we are not also testing what happens when the last player leaves
      const extraPlayer = new Player(nanoid(), mock<TownEmitter>());
      area.add(extraPlayer);
      area.remove(player);

      expect(area.occupantsByID).toEqual([extraPlayer.id]);
      const lastEmittedUpdate = getLastEmittedEvent(emitter, 'interactableUpdate');
      expect(lastEmittedUpdate).toEqual({ id, stars, title, imageContents });
    });
    it("Clears the player's interactableID and emits an update for their location", () => {
      area.remove(player);
      expect(player.location.interactableID).toBeUndefined();
      const lastEmittedMovement = getLastEmittedEvent(emitter, 'playerMoved');
      expect(lastEmittedMovement.location.interactableID).toBeUndefined();
    });
    it('Clears the poster image and title and sets stars to zero when the last occupant leaves', () => {
      area.remove(player);
      const lastEmittedUpdate = getLastEmittedEvent(emitter, 'interactableUpdate');
      expect(lastEmittedUpdate).toEqual({
        id,
        stars: 0,
        title: undefined,
        imageContents: undefined,
      });
      expect(area.title).toBeUndefined();
      expect(area.imageContents).toBeUndefined();
      expect(area.stars).toEqual(0);
    });
  });
  describe('add', () => {
    it('Adds the player to the occupants list', () => {
      expect(area.occupantsByID).toEqual([player.id]);
    });
    it("Sets the player's interactableID and emits an update for their location", () => {
      expect(player.location.interactableID).toEqual(id);
      const lastEmittedMovement = getLastEmittedEvent(emitter, 'playerMoved');
      expect(lastEmittedMovement.location.interactableID).toEqual(id);
    });
  });
  test('toModel sets the ID, stars, title, and imageContents', () => {
    const model = area.toModel();
    expect(model).toEqual({
      id,
      stars,
      title,
      imageContents,
    });
  });
  test('updateModel sets stars, title, and imageContents', () => {
    const newId = 'spam';
    const newStars = 2;
    const newTitle = 'New Test Poster Title';
    const newImageContents = 'random string not image';
    area.updateModel({
      id: newId,
      stars: newStars,
      title: newTitle,
      imageContents: newImageContents,
    });
    expect(area.stars).toBe(newStars);
    expect(area.id).toBe(id);
    expect(area.title).toBe(newTitle);
    expect(area.imageContents).toBe(newImageContents);
  });
  describe('fromMapObject', () => {
    it('Throws an error if the width or height are missing', () => {
      expect(() =>
        PosterSessionArea.fromMapObject(
          { id: 1, name: nanoid(), visible: true, x: 0, y: 0 },
          emitter,
        ),
      ).toThrowError();
    });
    it('Creates a new poster session area using provided boundingBox and id, with no poster (i.e. title and image undefined, no stars), and emitter', () => {
      const x = 30;
      const y = 20;
      const width = 10;
      const height = 20;
      const name = 'name';
      const val = PosterSessionArea.fromMapObject(
        { x, y, width, height, name, id: 10, visible: true },
        emitter,
      );
      expect(val.boundingBox).toEqual({ x, y, width, height });
      expect(val.id).toEqual(name);
      expect(val.title).toBeUndefined();
      expect(val.stars).toEqual(0);
      expect(val.imageContents).toBeUndefined();
      expect(val.occupantsByID).toEqual([]);
    });
  });
});
