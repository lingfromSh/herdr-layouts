APP    ?= $(HOME)/.config/herdr-app
MOD    := mods/tsk
LAYOUT := layouts/herdr-work.json

.PHONY: help install test check shot pull uninstall

help:
	@echo "make install    copy the mod and the layout into $(APP) (runs ./install.sh)"
	@echo "make test       node --test tests/"
	@echo "make check      tests, then herdr-app check $(MOD) (QuickJS rules the tests cannot see)"
	@echo "make shot       screenshot the window into $(LAYOUT)'s png"
	@echo "make pull       copy the live layout back from $(APP) (after arranging it by hand)"
	@echo "make uninstall  remove the mod and layout from $(APP)"

install:
	./install.sh

test:
	node --test tests/

check: test
	herdr-app check $(MOD)

shot:
	herdr-app shot $(LAYOUT:.json=.png)

pull:
	cp $(APP)/$(LAYOUT) $(LAYOUT)
	@echo "pulled $(APP)/$(LAYOUT) → $(LAYOUT)"

uninstall:
	rm -rf $(APP)/$(MOD) $(APP)/$(LAYOUT) $(APP)/$(LAYOUT:.json=.png)
	@echo "removed the tsk mod and herdr-work from $(APP)"
