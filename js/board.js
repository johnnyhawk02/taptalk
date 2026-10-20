// Default vocabulary. Colours follow the Fitzgerald key so word types are
// always in the same colour:
//   pron = people/pronouns (yellow)   verb = actions (green)
//   desc = describing (blue)          noun = things (orange)
//   social = social words (pink)      neg = no/stop (red)
//   q = questions (purple)            folder = opens a page (grey)
//
// Symbol refs: "m:<name>" = Mulberry symbol, "c:<name>" = custom symbol in
// symbols/custom, "u:<id>" = a photo added by a caregiver.
//
// Each item is [label, symbol, type, extra] where extra may hold
// { say: 'spoken text', link: 'pageId' }.

const F = (label, sym, link) => [label, sym, 'folder', { link }];

export const DEFAULT_PAGES = {
  home: {
    name: 'Home',
    items: [
      ['I', 'c:I', 'pron'], ['want', 'm:want_,_to', 'verb'], ['more', 'm:more', 'desc'],
      ['help', 'm:help_,_to', 'verb'], ['stop', 'c:stop', 'neg'], ['yes', 'm:correct', 'social'],

      ['you', 'c:you', 'pron'], ['go', 'm:go_,_to', 'verb'], ['like', 'm:good', 'verb'],
      ["don't like", 'm:bad', 'neg', { say: "don't like" }], ['all done', 'm:finish', 'social'], ['no', 'm:mistake_no_wrong', 'neg'],

      ['eat', 'm:eat_,_to', 'verb'], ['drink', 'm:drink_,_to', 'verb'], ['play', 'm:play_,_to', 'verb'],
      ['toilet', 'm:need_toilet', 'noun'], ['hurt', 'm:plaster', 'desc'], ['wait', 'm:wait_,_to', 'verb'],

      F('Food', 'm:dinner_hot', 'food'), F('Drinks', 'm:drink', 'drinks'), F('Play', 'm:toys', 'play'),
      F('Feelings', 'm:happy_man', 'feelings'), F('People', 'm:family', 'people'), F('Places', 'm:house', 'places'),

      F('Actions', 'm:jump_,_to', 'actions'), F('Describe', 'm:large', 'describe'), F('Body', 'm:body_outline', 'body'),
      F('Animals', 'm:dog', 'animals'), F('Colours', 'm:rainbow', 'colours'), F('Chat', 'm:hello', 'chat'),
    ],
  },

  food: {
    name: 'Food',
    items: [
      ['apple', 'm:apple', 'noun'], ['banana', 'm:banana', 'noun'], ['grapes', 'm:grapes', 'noun'],
      ['strawberry', 'm:strawberry', 'noun'], ['orange', 'm:orange', 'noun'], ['crisps', 'm:crisps', 'noun'],
      ['biscuit', 'm:biscuits', 'noun'], ['sandwich', 'm:sandwich', 'noun'], ['toast', 'm:toast', 'noun'],
      ['cereal', 'm:cereal', 'noun'], ['yogurt', 'm:yogurt', 'noun'], ['pizza', 'm:pizza', 'noun'],
      ['pasta', 'm:pasta', 'noun'], ['chips', 'm:chips', 'noun'], ['chicken', 'm:chicken', 'noun'],
      ['egg', 'm:egg', 'noun'], ['cheese', 'm:cheese', 'noun'], ['bread', 'm:bread', 'noun'],
      ['ice cream', 'm:ice_cream', 'noun'], ['chocolate', 'm:chocolate', 'noun'], ['sweets', 'm:sweet', 'noun'],
      ['cake', 'm:cake', 'noun'], ['breakfast', 'm:breakfast_1', 'noun'], ['dinner', 'm:dinner', 'noun'],
      ['hungry', 'm:hungry', 'desc'],
    ],
  },

  drinks: {
    name: 'Drinks',
    items: [
      ['water', 'm:water', 'noun'], ['milk', 'm:milk', 'noun'], ['juice', 'm:orange_juice', 'noun'],
      ['apple juice', 'm:apple_juice', 'noun'], ['squash', 'm:orange_squash', 'noun'], ['milkshake', 'm:milkshake', 'noun'],
      ['hot chocolate', 'm:hot_chocolate', 'noun'], ['my cup', 'm:cup_non_spill', 'noun'], ['thirsty', 'm:thirsty', 'desc'],
    ],
  },

  play: {
    name: 'Play',
    items: [
      ['toys', 'm:toys', 'noun'], ['ball', 'm:ball', 'noun'], ['bubbles', 'm:bubbles', 'noun'],
      ['lego', 'm:lego', 'noun'], ['blocks', 'm:bricks', 'noun'], ['puzzle', 'm:jigsaw_puzzle', 'noun'],
      ['teddy', 'm:teddy_bear', 'noun'], ['doll', 'm:doll', 'noun'], ['dinosaur', 'm:dinosaur', 'noun'],
      ['car', 'm:toy_car', 'noun'], ['playdough', 'm:playdough', 'noun'], ['draw', 'm:draw_,_to', 'verb'],
      ['paint', 'm:paint', 'noun'], ['book', 'm:read_book_,_to', 'noun'], ['stickers', 'm:stickers', 'noun'],
      ['balloon', 'm:balloon', 'noun'], ['sand', 'm:sand_pit', 'noun'], ['water play', 'm:water_table', 'noun'],
      ['swing', 'm:swing', 'noun'], ['slide', 'm:slide', 'noun'], ['trampoline', 'm:trampoline', 'noun'],
      ['music', 'm:music', 'noun'], ['TV', 'm:childrens_tv', 'noun'], ['games', 'm:computer_game', 'noun'],
      ['headphones', 'm:headphones', 'noun'], ['lights', 'm:lava_lamp', 'noun'], ['kite', 'm:kite', 'noun'],
    ],
  },

  feelings: {
    name: 'Feelings',
    items: [
      ['happy', 'm:happy_man', 'desc'], ['sad', 'm:sad_man', 'desc'], ['angry', 'm:angry_man', 'desc'],
      ['scared', 'm:afraid_man', 'desc'], ['tired', 'm:yawn_,_to', 'desc'], ['excited', 'm:excited_man', 'desc'],
      ['worried', 'm:worried_man', 'desc'], ['confused', 'm:confused_man', 'desc'], ['silly', 'm:laughing_man', 'desc'],
      ['calm', 'm:serene_man', 'desc'], ['sick', 'm:vomit_,_to', 'desc'], ['hurt', 'm:plaster', 'desc'],
      ['too loud', 'm:noisy', 'desc'], ['quiet please', 'm:quiet', 'desc'], ['I need a break', 'm:break_time_1', 'social'],
      ['cuddle', 'm:hug_,_to', 'verb'], ['hot', 'm:hot', 'desc'], ['cold', 'm:snow', 'desc'],
      ['hungry', 'm:hungry', 'desc'], ['thirsty', 'm:thirsty', 'desc'],
    ],
  },

  people: {
    name: 'People',
    items: [
      ['me', 'c:I', 'pron'], ['you', 'c:you', 'pron'], ['mum', 'm:mum_parent', 'pron'],
      ['dad', 'm:dad_parent', 'pron'], ['brother', 'm:brother', 'pron'], ['sister', 'm:sister', 'pron'],
      ['nan', 'm:grandmother', 'pron'], ['grandad', 'm:grandfather', 'pron'], ['family', 'm:family', 'pron'],
      ['teacher', 'm:teacher_1a', 'pron'], ['baby', 'm:baby', 'pron'], ['doctor', 'm:doctor_1a', 'pron'],
    ],
  },

  places: {
    name: 'Places',
    items: [
      ['home', 'm:house', 'noun'], ['school', 'm:school', 'noun'], ['park', 'm:park_,_to', 'noun'],
      ['outside', 'm:go_outside_,_to', 'noun'], ['playground', 'm:play_area', 'noun'], ['shop', 'm:shop', 'noun'],
      ['car', 'm:car', 'noun'], ['bus', 'm:bus', 'noun'], ['swimming', 'm:swim_,_to', 'noun'],
      ['beach', 'm:beach', 'noun'], ['bed', 'm:single_bed', 'noun'], ['bath', 'm:bath', 'noun'],
      ['toilet', 'm:toilet', 'noun'], ['sensory room', 'm:sensory_room', 'noun'], ['doctor', 'm:surgery_health_centre', 'noun'],
    ],
  },

  actions: {
    name: 'Actions',
    items: [
      ['go', 'm:go_,_to', 'verb'], ['come', 'm:come_,_to', 'verb'], ['look', 'm:look_,_to', 'verb'],
      ['give', 'm:give_,_to', 'verb'], ['get', 'm:get_,_to', 'verb'], ['make', 'm:make_,_to', 'verb'],
      ['open', 'm:open_2', 'verb'], ['close', 'm:close_,_to', 'verb'], ['put', 'm:put_,_to', 'verb'],
      ['turn on', 'm:turn_on_,_to', 'verb'], ['turn off', 'm:turn_off_,_to', 'verb'], ['push', 'm:push_,_to', 'verb'],
      ['pull', 'm:pull_,_to', 'verb'], ['sit', 'm:sit_,_to', 'verb'], ['stand', 'm:stand_,_to', 'verb'],
      ['walk', 'm:walk_,_to', 'verb'], ['run', 'm:run_,_to', 'verb'], ['jump', 'm:jump_,_to', 'verb'],
      ['dance', 'm:dance_,_to', 'verb'], ['sing', 'm:sing_,_to', 'verb'], ['read', 'm:read_book_,_to', 'verb'],
      ['watch', 'm:watch_,_to', 'verb'], ['listen', 'm:hear_,_to', 'verb'], ['sleep', 'm:sleep_male_,_to', 'verb'],
      ['wash hands', 'm:wash_hands_,_to', 'verb'], ['get dressed', 'm:get_dressed_,_to', 'verb'], ['tickle', 'm:tickle_,_to', 'verb'],
      ['hug', 'm:hug_,_to', 'verb'], ['brush teeth', 'm:teeth', 'verb'], ['swim', 'm:swim_,_to', 'verb'],
    ],
  },

  describe: {
    name: 'Describe',
    items: [
      ['big', 'm:large', 'desc'], ['little', 'm:little', 'desc'], ['more', 'm:more', 'desc'],
      ['good', 'm:good', 'desc'], ['bad', 'm:bad', 'desc'], ['same', 'm:same', 'desc'],
      ['hot', 'm:hot', 'desc'], ['cold', 'm:snow', 'desc'], ['wet', 'm:wet', 'desc'],
      ['dirty', 'm:dirty', 'desc'], ['broken', 'm:broken', 'desc'], ['loud', 'm:loud', 'desc'],
      ['quiet', 'm:quiet', 'desc'], ['empty', 'm:empty', 'desc'], ['full', 'm:full', 'desc'],
      ['fast', 'm:fast_2', 'desc'], ['now', 'm:now', 'desc'], ['again', 'c:again', 'desc'],
      ['up', 'm:up', 'desc'], ['down', 'm:down', 'desc'], ['in', 'm:in', 'desc'],
      ['out', 'm:out', 'desc'], ['on', 'm:on', 'desc'], ['off', 'm:off', 'desc'],
    ],
  },

  body: {
    name: 'Body',
    items: [
      ['head', 'm:head', 'noun'], ['eyes', 'm:eyes', 'noun'], ['ears', 'm:ear', 'noun'],
      ['mouth', 'm:mouth', 'noun'], ['teeth', 'm:teeth', 'noun'], ['tummy', 'm:stomach', 'noun'],
      ['arm', 'm:arm', 'noun'], ['hand', 'm:right_hand', 'noun'], ['leg', 'm:leg', 'noun'],
      ['foot', 'm:foot', 'noun'], ['back', 'm:back', 'noun'], ['hurt', 'm:plaster', 'desc'],
      ['headache', 'm:headache', 'noun', { say: 'my head hurts' }],
      ['tummy ache', 'm:stomach_ache', 'noun', { say: 'my tummy hurts' }],
      ['toothache', 'm:toothache', 'noun', { say: 'my tooth hurts' }],
      ['itchy', 'm:itch', 'desc'], ['cut', 'm:cut', 'noun'], ['sick', 'm:vomit_,_to', 'desc'],
    ],
  },

  animals: {
    name: 'Animals',
    items: [
      ['dog', 'm:dog', 'noun'], ['cat', 'm:cat', 'noun'], ['horse', 'm:horse', 'noun'],
      ['cow', 'm:cow', 'noun'], ['pig', 'm:piglet', 'noun'], ['sheep', 'm:sheep', 'noun'],
      ['duck', 'm:duck', 'noun'], ['bird', 'm:bird', 'noun'], ['fish', 'm:fish', 'noun'],
      ['rabbit', 'm:rabbit', 'noun'], ['frog', 'm:frog', 'noun'], ['lion', 'm:lion', 'noun'],
      ['elephant', 'm:elephant', 'noun'], ['tiger', 'm:tiger', 'noun'], ['giraffe', 'm:giraffe', 'noun'],
      ['dinosaur', 'm:dinosaur', 'noun'],
    ],
  },

  colours: {
    name: 'Colours',
    items: [
      ['red', 'm:red', 'desc'], ['blue', 'm:blue', 'desc'], ['green', 'm:green', 'desc'],
      ['yellow', 'm:yellow', 'desc'], ['pink', 'm:pink', 'desc'], ['purple', 'm:purple', 'desc'],
      ['orange', 'm:terracotta', 'desc'], ['black', 'm:black', 'desc'], ['white', 'm:white', 'desc'],
      ['brown', 'm:brown', 'desc'],
    ],
  },

  chat: {
    name: 'Chat',
    items: [
      ['hello', 'm:hello', 'social'], ['goodbye', 'm:hello', 'social'], ['please', 'c:please', 'social'],
      ['thank you', 'c:thank_you', 'social'], ['yes', 'm:correct', 'social'], ['no', 'm:mistake_no_wrong', 'neg'],
      ['my turn', 'c:I', 'social'], ['your turn', 'c:you', 'social'], ['again', 'c:again', 'social'],
      ['help me', 'm:help_,_to', 'social', { say: 'help me please' }], ['look at me', 'm:look_,_to', 'social'],
      ['I need a break', 'm:break_time_1', 'social'], ['all done', 'm:finish', 'social'], ['stop', 'c:stop', 'neg'],
      ['I love you', 'm:hug_,_to', 'social'],
      ['what', 'm:what', 'q'], ['where', 'm:where', 'q'], ['who', 'm:who', 'q'],
      ['when', 'm:when', 'q'], ['why', 'm:why', 'q'],
    ],
  },
};
