CREATE TABLE IF NOT EXISTS online_presence(user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS online_friends(user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, friend_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,friend_id),CHECK(user_id<>friend_id));
CREATE TABLE IF NOT EXISTS online_challenges(id TEXT PRIMARY KEY, from_user TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, to_user TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, game_id TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
CREATE INDEX IF NOT EXISTS online_challenges_target ON online_challenges(to_user,status,created_at);
CREATE INDEX IF NOT EXISTS online_friends_reverse ON online_friends(friend_id);

CREATE TABLE IF NOT EXISTS online_friend_requests(id TEXT PRIMARY KEY, from_user TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, to_user TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), UNIQUE(from_user,to_user), CHECK(from_user<>to_user));
CREATE INDEX IF NOT EXISTS online_friend_requests_inbox ON online_friend_requests(to_user,status,created_at);
