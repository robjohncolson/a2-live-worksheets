// username.js — fruit_animal username generator
// Ported from study_guide_diagnostic.html lines 2621-2640.
// Uniqueness is enforced by the DB UNIQUE constraint; call generateUsername()
// and retry on collision (up to 8×) in server.js — NOT an in-memory set.

const USERNAME_FRUITS = [
  'apple','banana','cherry','grape','kiwi','lemon','lime','mango','melon','peach',
  'pear','plum','berry','fig','date','guava','lychee','papaya','orange','apricot',
  'coconut','pineapple','pomelo','quince','raisin','olive','tomato','avocado','pumpkin','cranberry'
];

const USERNAME_ANIMALS = [
  'koala','panda','tiger','lion','bear','wolf','fox','otter','seal','whale',
  'shark','eagle','hawk','owl','duck','swan','deer','moose','zebra','horse',
  'llama','sloth','gecko','turtle','frog','toad','rabbit','hamster','badger','beaver'
];

const USERNAME_VEHICLES = [
  'car','truck','van','jeep','bus','taxi','train','tram','airplane','jet',
  'rocket','boat','yacht','canoe','kayak','bike','scooter','tractor','wagon','glider'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Returns a candidate username string — NOT guaranteed unique.
// Caller retries on DB collision.
// Phase 1: fruit_animal
// Phase 2: fruit_animal_vehicle
// Phase 3: fruit_animal_<rand 0-9999>
export function generateUsername(attempt = 0) {
  const fruit = pick(USERNAME_FRUITS);
  const animal = pick(USERNAME_ANIMALS);

  if (attempt < 4) {
    return `${fruit}_${animal}`;
  }
  if (attempt < 8) {
    return `${fruit}_${animal}_${pick(USERNAME_VEHICLES)}`;
  }
  return `${fruit}_${animal}_${Math.floor(Math.random() * 10000)}`;
}
