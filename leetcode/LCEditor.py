class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        hmap = {}

        for i in range(len(nums)):
            if nums[i] not in hmap:
                hmap[nums[i]] = i
            diff = target - nums[i]
            if diff in hmap and hmap[diff] != i:
                return [hmap[diff], i]
       #this is new 
        #another solution
