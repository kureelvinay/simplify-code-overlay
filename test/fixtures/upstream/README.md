Verbatim copies of upstream files at tag v1.18.31, used as transform fixtures. Never edit them by hand;
refresh with `git -C work/<version> show HEAD:<path> > test/fixtures/upstream/<path>`.

Exception: `packages/desktop/icons/prod/*` are 1-byte stand-ins. They are binary drop-in targets, the
engine only checks that a target exists, and upstream's originals total about 1.5 MB.
