import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { readFileSync } from 'fs';
import { Interactable, TownEmitter, PosterSessionArea } from '../types/CoveyTownSocket';
import TownsStore from '../lib/TownsStore';
import { getLastEmittedEvent, mockPlayer, MockedPlayer, isPosterSessionArea } from '../TestUtils';
import { TownsController } from './TownsController';

type TestTownData = {
  friendlyName: string;
  townID: string;
  isPubliclyListed: boolean;
  townUpdatePassword: string;
};

const broadcastEmitter = jest.fn();
describe('TownsController integration tests', () => {
  let controller: TownsController;

  const createdTownEmitters: Map<string, DeepMockProxy<TownEmitter>> = new Map();
  async function createTownForTesting(
    friendlyNameToUse?: string,
    isPublic = false,
  ): Promise<TestTownData> {
    const friendlyName =
      friendlyNameToUse !== undefined
        ? friendlyNameToUse
        : `${isPublic ? 'Public' : 'Private'}TestingTown=${nanoid()}`;
    const ret = await controller.createTown({
      friendlyName,
      isPubliclyListed: isPublic,
      mapFile: 'testData/indoors.json',
    });
    return {
      friendlyName,
      isPubliclyListed: isPublic,
      townID: ret.townID,
      townUpdatePassword: ret.townUpdatePassword,
    };
  }
  function getBroadcastEmitterForTownID(townID: string) {
    const ret = createdTownEmitters.get(townID);
    if (!ret) {
      throw new Error(`Could not find broadcast emitter for ${townID}`);
    }
    return ret;
  }

  beforeAll(() => {
    // Set the twilio tokens to dummy values so that the unit tests can run
    process.env.TWILIO_API_AUTH_TOKEN = 'testing';
    process.env.TWILIO_ACCOUNT_SID = 'ACtesting';
    process.env.TWILIO_API_KEY_SID = 'testing';
    process.env.TWILIO_API_KEY_SECRET = 'testing';
  });

  beforeEach(async () => {
    createdTownEmitters.clear();
    broadcastEmitter.mockImplementation((townID: string) => {
      const mockRoomEmitter = mockDeep<TownEmitter>();
      createdTownEmitters.set(townID, mockRoomEmitter);
      return mockRoomEmitter;
    });
    TownsStore.initializeTownsStore(broadcastEmitter);
    controller = new TownsController();
  });

  describe('Interactables', () => {
    let testingTown: TestTownData;
    let player: MockedPlayer;
    let sessionToken: string;
    let interactables: Interactable[];
    beforeEach(async () => {
      testingTown = await createTownForTesting(undefined, true);
      player = mockPlayer(testingTown.townID);
      await controller.joinTown(player.socket);
      const initialData = getLastEmittedEvent(player.socket, 'initialize');
      sessionToken = initialData.sessionToken;
      interactables = initialData.interactables;
    });

    describe('Create Poster Session Area', () => {
      it('Executes without error when creating a new poster session area', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
          };
          await controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          );
          // Check to see that the poster session area was successfully updated
          const townEmitter = getBroadcastEmitterForTownID(testingTown.townID);
          const updateMessage = getLastEmittedEvent(townEmitter, 'interactableUpdate');
          if (isPosterSessionArea(updateMessage)) {
            expect(updateMessage).toEqual(newPosterSessionArea);
          } else {
            fail(
              'Expected an interactableUpdate to be dispatched with the new poster session area',
            );
          }
        }
      });
      it('Returns an error message if the town ID is invalid', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        const newPosterSessionArea = {
          id: posterSessionArea.id,
          stars: 0,
          title: 'Test title',
          imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
        };
        await expect(
          controller.createPosterSessionArea(nanoid(), sessionToken, newPosterSessionArea),
        ).rejects.toThrow();
      });
      it('Checks for a valid session token before creating a poster session area', async () => {
        const invalidSessionToken = nanoid();
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        const newPosterSessionArea = {
          id: posterSessionArea.id,
          stars: 0,
          title: 'Test title',
          imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
        };
        await expect(
          controller.createPosterSessionArea(
            testingTown.townID,
            invalidSessionToken,
            newPosterSessionArea,
          ),
        ).rejects.toThrow();
      });
      it('Returns an error message if addPosterSessionArea returns false', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        const newPosterSessionArea = {
          id: nanoid(),
          stars: posterSessionArea.stars,
          title: posterSessionArea.title,
          imageContents: posterSessionArea.imageContents,
        };
        await expect(
          controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          ),
        ).rejects.toThrow();
      });
      it('Cant create a poster session area with no image', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            // image contents is undefined
          };
          await expect(
            controller.createPosterSessionArea(
              testingTown.townID,
              sessionToken,
              newPosterSessionArea,
            ),
          ).rejects.toThrow();
        }
      });
      it('Cant create a poster session area with no title', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
            // title is undefined
          };
          await expect(
            controller.createPosterSessionArea(
              testingTown.townID,
              sessionToken,
              newPosterSessionArea,
            ),
          ).rejects.toThrow();
        }
      });
    });
    describe('Interact with existing Poster Session Area', () => {
      it('Gets the image contents of a poster session area', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
          };
          await controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          );
          const imageContents = await controller.getPosterAreaImageContents(
            testingTown.townID,
            posterSessionArea.id,
            sessionToken,
          );
          expect(imageContents).toEqual(newPosterSessionArea.imageContents);
        }
      });
      it('Executes getPosterAreaImageContents without error when retrieving undefined image contents', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: undefined,
          };
          const imageContents = await controller.getPosterAreaImageContents(
            testingTown.townID,
            newPosterSessionArea.id,
            sessionToken,
          );
          expect(imageContents).toBeUndefined();
        }
      });
      it('Returns an error message for getPosterAreaImageContents if the given townId is invalid', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const invalidTown = nanoid();
          await expect(
            controller.getPosterAreaImageContents(invalidTown, posterSessionArea.id, sessionToken),
          ).rejects.toThrow();
        }
      });
      it('Returns an error message for getPosterAreaImageContents if the given sessionToken is invalid', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const invalidSessionToken = nanoid();
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
          };
          await controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          );
          await expect(
            controller.getPosterAreaImageContents(
              testingTown.townID,
              posterSessionArea.id,
              invalidSessionToken,
            ),
          ).rejects.toThrow();
        }
      });
      it('Returns an error message for getPosterAreaImageContents if the given posterSessionId is invalid', async () => {
        const invalidPosterSessionArea = nanoid();
        await expect(
          controller.getPosterAreaImageContents(
            testingTown.townID,
            invalidPosterSessionArea,
            sessionToken,
          ),
        ).rejects.toThrow();
      });
      it('Increments from 0 to 1 star on a poster session area', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
          };
          await controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          );
          const stars = await controller.incrementPosterAreaStars(
            testingTown.townID,
            posterSessionArea.id,
            sessionToken,
          );
          expect(stars).toEqual(newPosterSessionArea.stars + 1);
        }
      });
      it('Executes incrementPosterAreaStars without error with image contents are undefined', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: undefined,
          };
          const imageContents = await controller.getPosterAreaImageContents(
            testingTown.townID,
            newPosterSessionArea.id,
            sessionToken,
          );
          expect(imageContents).toBeUndefined();
        }
      });
      it('Returns an error message for incrementPosterAreaStars if the given sessionToken is invalid', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const invalidSessionToken = nanoid();
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 0,
            title: 'Test title',
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
          };
          await controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          );
          await expect(
            controller.incrementPosterAreaStars(
              testingTown.townID,
              posterSessionArea.id,
              invalidSessionToken,
            ),
          ).rejects.toThrow();
        }
      });
      it('Increments non 0 number of stars on a poster session area', async () => {
        const posterSessionArea = interactables.find(isPosterSessionArea) as PosterSessionArea;
        if (!posterSessionArea) {
          fail('Expected at least one poster session area to be returned in the initial join data');
        } else {
          const newPosterSessionArea = {
            id: posterSessionArea.id,
            stars: 3,
            title: 'Test title',
            imageContents: readFileSync('testData/poster.jpg', 'utf-8'),
          };
          await controller.createPosterSessionArea(
            testingTown.townID,
            sessionToken,
            newPosterSessionArea,
          );
          const stars = await controller.incrementPosterAreaStars(
            testingTown.townID,
            posterSessionArea.id,
            sessionToken,
          );
          expect(stars).toEqual(newPosterSessionArea.stars + 1);
        }
      });
    });
  });
});
